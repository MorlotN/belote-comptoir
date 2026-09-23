"""De vraies parties dans Chrome headless (bin/e2e) : la page statique servie en local,
chaque joueur n'agit que par l'interface (donner, annoncer, choisir l'atout, toucher
deux fois une carte pour la poser, passer à la manche suivante).

- en réseau : trois navigateurs, liaison directe par PeerJS (il faut Internet : le
  serveur public de PeerJS sert à se trouver) ;
- sur un seul téléphone : un navigateur qu'on « se passe ».
"""

from __future__ import annotations

import functools
import http.server
import os
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CHROME = os.environ.get("BELOTE_CHROME", "/usr/bin/google-chrome")
SHOTS = os.environ.get("BELOTE_SHOTS")  # dossier où poser des captures, facultatif
PHONE = {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2, "is_mobile": True, "has_touch": True}


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def site():
    handler = functools.partial(QuietHandler, directory=str(ROOT / "frontend"))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture(scope="module")
def browser():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME, headless=True,
                               args=["--disable-features=WebRtcHideLocalIpsWithMdns"])
        yield b
        b.close()


def shot(page, name, full=True):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        page.screenshot(path=f"{SHOTS}/{name}.png", full_page=full)


def new_phone(browser, errors):
    page = browser.new_context(**PHONE).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    return page


def take_turn(page, i, taken):
    """Fait jouer ce téléphone s'il a la main ; renvoie vrai s'il a agi."""
    if page.locator(".picker button").count():
        if "donne" not in taken:
            shot(page, "03-donne")
            taken.add("donne")
        page.click(".picker button:has-text('4')")
    elif page.locator(".stepper").count():
        if "annonce" not in taken:
            shot(page, "04-annonce")
            taken.add("annonce")
        if page.locator(".bid-chip:not(.pass)").count():
            page.click("button:has-text('Passer')")
        else:
            page.click("button:has-text('+5')")
            page.click("button:has-text('Annoncer')")
    elif page.locator(".suits button").count():
        page.click(".suits button >> nth=%d" % (i % 4))
    elif page.locator(".card.playable").count():
        page.locator(".card.playable").first.click()
        if "pli" not in taken and page.locator(".played").count():
            shot(page, "05-pli")
            taken.add("pli")
        page.locator(".card.selected").click()
    else:
        return False
    return True


def test_partie_en_reseau_a_trois(site, browser):
    errors: list[str] = []
    host, paul, lea = pages = [new_phone(browser, errors) for _ in range(3)]

    host.goto(site)
    shot(host, "01-accueil")
    host.fill("input[autocomplete=nickname]", "Nico")
    host.click("button:has-text('Ouvrir une table')")
    host.wait_for_selector(".big-code")
    host.wait_for_selector(".conn.online", timeout=20000)  # inscrit auprès du serveur PeerJS
    code = host.inner_text(".big-code").strip()
    for page, name in ((paul, "Paul"), (lea, "Léa")):
        page.goto(f"{site}#/t/{code}")
        page.fill("input[autocomplete=nickname]", name)
        page.click("button:has-text(\"S'asseoir\")")
        page.wait_for_selector(".seats", timeout=30000)
    host.wait_for_function("document.querySelectorAll('.seats li').length === 3", timeout=20000)
    host.click(".segmented button:has-text('3')")
    paul.wait_for_selector(".segmented button.on:has-text('3')")  # le réglage de l'hôte arrive chez les invités
    shot(host, "02-salon")

    # les règles s'ouvrent pendant la partie sans quitter la table
    paul.click("button:has-text('Règles')")
    paul.wait_for_selector(".sheet .table-rules")
    assert "premier à 3" in paul.inner_text(".sheet .table-rules").lower()
    paul.click(".sheet .icon-btn")

    host.click("button:has-text('Distribuer')")
    taken: set[str] = set()
    for _ in range(800):
        if all(p.locator(".final").count() for p in pages):
            break
        acted = False
        for i, page in enumerate(pages):
            if take_turn(page, i, taken):
                acted = True
            elif i == 0 and page.locator("button:has-text('Manche suivante')").count():
                if "resultat" not in taken:
                    shot(page, "06-resultat")
                    taken.add("resultat")
                page.click("button:has-text('Manche suivante')")
                acted = True
            if acted:
                page.wait_for_timeout(100)
                break
        if not acted:  # l'état n'est pas encore arrivé partout
            pages[0].wait_for_timeout(150)
    for page in pages:
        page.wait_for_selector(".final", timeout=10000)
    shot(host, "07-fin")
    host.click("button:has-text('Règles')")
    host.wait_for_selector(".sheet")
    host.wait_for_timeout(400)
    shot(host, "08-regles", full=False)
    host.click(".sheet .icon-btn")
    host.click("button:has-text('Nouvelle partie')")
    host.wait_for_selector(".big-code")
    lea.wait_for_selector(".big-code")
    assert not errors, errors


def test_partie_sur_un_seul_telephone(site, browser):
    errors: list[str] = []
    page = new_phone(browser, errors)
    page.goto(f"{site}#/solo")
    for name in ("Nico", "Paul", "Léa"):
        page.fill("input[placeholder]", name)
        page.click("button:has-text('Ajouter')")
    page.click(".segmented button:has-text('3')")
    page.click("button:has-text('Distribuer')")
    taken: set[str] = set()
    handoffs = 0
    for _ in range(800):
        if page.locator(".final").count():
            break
        if page.locator(".handoff").count():
            if "passage" not in taken:
                shot(page, "09-passage")
                taken.add("passage")
            assert page.locator(".hand .card").count() == 0  # aucune main visible au passage
            page.click("button:has-text(\"C'est moi\")")
            handoffs += 1
        elif not take_turn(page, 0, taken):
            page.click("button:has-text('Manche suivante')")
    assert page.locator(".final").count()
    assert handoffs > 5
    assert not errors, errors
