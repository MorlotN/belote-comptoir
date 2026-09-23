"""Une vraie partie à trois téléphones : serveur réel + Chrome headless (bin/e2e).

Chaque joueur agit seulement par l'interface : donner, annoncer, choisir l'atout,
toucher deux fois une carte pour la poser, passer à la manche suivante.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
CHROME = os.environ.get("BELOTE_CHROME", "/usr/bin/google-chrome")
SHOTS = os.environ.get("BELOTE_SHOTS")  # dossier où poser des captures, facultatif

pytestmark = pytest.mark.e2e


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def server():
    port = free_port()
    url = f"http://127.0.0.1:{port}"
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "belote.app:app", "--app-dir", "backend",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            if httpx.get(f"{url}/api/health", timeout=1).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.2)
    yield url
    proc.terminate()
    out, _ = proc.communicate(timeout=5)
    assert b"Traceback" not in (out or b""), out.decode(errors="replace")


def shot(page, name):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)


def test_partie_complete_a_trois(server):
    from playwright.sync_api import sync_playwright

    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True)
        pages = []
        for _ in range(3):
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            pages.append(page)

        host, paul, lea = pages
        host.goto(server)
        shot(host, "01-accueil")
        host.fill("input[autocomplete=nickname]", "Nico")
        host.click("text=Ouvrir une table >> nth=-1")
        host.wait_for_selector(".big-code")
        code = host.inner_text(".big-code").strip()
        for page, name in ((paul, "Paul"), (lea, "Léa")):
            page.goto(f"{server}/#/t/{code}")
            page.fill("input[autocomplete=nickname]", name)
            page.click("button:has-text(\"S'asseoir\")")
            page.wait_for_selector(".seats")
        host.wait_for_function("document.querySelectorAll('.seats li').length === 3")
        host.click(".segmented button:has-text('3')")
        host.wait_for_selector(".segmented button.on:has-text('3')")
        shot(host, "02-salon")
        host.click("button:has-text('Distribuer')")

        shots_taken: set[str] = set()
        finished = False
        for _ in range(600):
            acted = False
            for i, page in enumerate(pages):
                if page.locator(".final").count():
                    finished = True
                    continue
                if page.locator(".picker button").count():
                    if "donne" not in shots_taken:
                        shot(page, "03-donne")
                        shots_taken.add("donne")
                    page.click(".picker button:has-text('4')")
                    acted = True
                elif page.locator(".stepper").count():
                    if "annonce" not in shots_taken:
                        shot(page, "04-annonce")
                        shots_taken.add("annonce")
                    has_bid = page.locator(".bid-chip:not(.pass)").count() > 0
                    if has_bid:
                        page.click("button:has-text('Passer')")
                    else:
                        page.click("button:has-text('+5')")
                        page.click("button:has-text('Annoncer')")
                    acted = True
                elif page.locator(".suits button").count():
                    page.click(".suits button >> nth=%d" % (i % 4))
                    acted = True
                elif page.locator(".card.playable").count():
                    card = page.locator(".card.playable").first
                    card.click()
                    if "pli" not in shots_taken and page.locator(".played").count():
                        shot(page, "05-pli")
                        shots_taken.add("pli")
                    page.locator(".card.selected").click()
                    acted = True
                elif i == 0 and page.locator("button:has-text('Manche suivante')").count():
                    if "resultat" not in shots_taken:
                        shot(page, "06-resultat")
                        shots_taken.add("resultat")
                    page.click("button:has-text('Manche suivante')")
                    acted = True
                if acted:
                    page.wait_for_timeout(120)
                    break
            if finished:
                break
            if not acted:  # l'état n'est pas encore arrivé partout
                pages[0].wait_for_timeout(150)

        assert finished, "la partie n'est pas allée au bout"
        for page in pages:
            page.wait_for_selector(".final")
        shot(host, "07-fin")
        host.click("button:has-text('Ardoise')")
        host.wait_for_selector(".sheet")
        host.wait_for_timeout(400)  # fin de l'animation d'ouverture
        if SHOTS:
            host.screenshot(path=f"{SHOTS}/08-ardoise.png")
        host.click(".sheet .icon-btn")
        host.click("button:has-text('Nouvelle partie')")
        host.wait_for_selector(".big-code")
        browser.close()
    assert not errors, errors
