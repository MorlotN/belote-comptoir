import random

import pytest

from belote import engine
from belote.engine import GameError, legal_cards, trick_winner


def T(*pairs):
    """Pli à partir de (joueur, carte)."""
    return [{"player": p, "card": c, "say": None} for p, c in pairs]


def table(n=3, target=10):
    game, host = engine.new_game("ABCD", "Nico")
    for name in ["Paul", "Léa", "Sam", "Zoé", "Max"][: n - 1]:
        engine.join(game, name)
    game.target = target
    return game


def by_name(game, name):
    return next(p for p in game.players if p.name == name)


def seat_first_dealer(game, seat=0):
    engine.start(game, game.players[0])
    game.dealer_seat = seat
    engine._begin_round(game)


# ----- cartes -----

def test_jeu_de_32_cartes_152_points_hors_der():
    assert len(engine.DECK) == 32 and len(set(engine.DECK)) == 32
    for trump in engine.SUITS:
        assert sum(engine.points(c, trump) for c in engine.DECK) == 152


def test_valet_et_neuf_d_atout_battent_l_as():
    assert trick_winner(T(("a", "AH"), ("b", "9H"), ("c", "JH")), "H") == "c"
    assert trick_winner(T(("a", "AH"), ("b", "9H")), "H") == "b"
    assert trick_winner(T(("a", "AH"), ("b", "10H")), "S") == "a"


def test_la_coupe_bat_la_couleur_et_la_defausse_ne_vaut_rien():
    assert trick_winner(T(("a", "AH"), ("b", "7S")), "S") == "b"
    assert trick_winner(T(("a", "7H"), ("b", "AC")), "S") == "a"


def test_obligation_de_fournir():
    assert sorted(legal_cards(["7H", "AC", "JS"], T(("a", "KH")), "S")) == ["7H"]


def test_obligation_de_couper_et_de_monter():
    hand = ["7S", "JS", "AC"]
    assert sorted(legal_cards(hand, T(("a", "KH")), "S")) == ["7S", "JS"]
    # un atout est déjà posé : il faut passer au-dessus si on peut
    assert legal_cards(hand, T(("a", "KH"), ("b", "9S")), "S") == ["JS"]


def test_qui_ne_peut_pas_monter_coupe_quand_meme():
    assert sorted(legal_cards(["7S", "8S", "AC"], T(("a", "KH"), ("b", "JS")), "S")) == ["7S", "8S"]


def test_monter_a_l_atout_demande():
    assert legal_cards(["7S", "JS", "AH"], T(("a", "9S")), "S") == ["JS"]
    assert sorted(legal_cards(["7S", "8S"], T(("a", "9S")), "S")) == ["7S", "8S"]


def test_sans_la_couleur_ni_atout_on_joue_ce_qu_on_veut():
    assert sorted(legal_cards(["7C", "AD"], T(("a", "KH")), "S")) == ["7C", "AD"]


# ----- table -----

def test_pseudos_en_double_sont_numerotes():
    game = table(2)
    p = engine.join(game, "nico")
    assert p.name == "nico 2"


def test_table_pleine_et_partie_commencee():
    game = table(6)
    with pytest.raises(GameError):
        engine.join(game, "Septième")
    game = table(2)
    engine.start(game, game.players[0])
    with pytest.raises(GameError):
        engine.join(game, "Retard")


def test_seul_l_hote_lance_et_il_faut_deux_joueurs():
    game = table(2)
    with pytest.raises(GameError):
        engine.start(game, game.players[1])
    solo, host = engine.new_game("SOLO", "Nico")
    with pytest.raises(GameError):
        engine.start(solo, host)


def test_l_hote_qui_part_passe_la_main():
    game = table(3)
    host = game.players[0]
    engine.remove_player(game, host, host.id)
    assert game.host == game.players[0].id and len(game.players) == 2


# ----- manche -----

def test_le_donneur_choisit_le_nombre_de_cartes():
    game = table(3)
    seat_first_dealer(game, 0)
    dealer = game.players[0]
    assert game.phase == "deal" and game.turn == dealer.id
    with pytest.raises(GameError):
        engine.deal(game, game.players[1], 3)
    with pytest.raises(GameError):
        engine.deal(game, dealer, 6)
    engine.deal(game, dealer, 4)
    assert all(len(p.hand) == 4 for p in game.players)
    cards = [c for p in game.players for c in p.hand]
    assert len(set(cards)) == 12
    assert game.phase == "bidding" and game.turn == game.players[1].id


def test_encheres_jusqu_a_ce_que_tous_les_autres_passent():
    game = table(3)
    seat_first_dealer(game, 0)
    nico, paul, lea = game.players
    engine.deal(game, nico, 5)
    engine.bid(game, paul, 20)
    with pytest.raises(GameError):
        engine.bid(game, lea, 20)  # il faut surenchérir
    engine.bid(game, lea, 25)
    engine.bid(game, nico, None)
    assert game.turn == paul.id
    engine.bid(game, paul, 30)
    assert game.turn == lea.id  # Nico a passé : il ne reparle plus
    engine.bid(game, lea, None)
    assert game.phase == "trump" and game.turn == paul.id and game.round.high_bid == 30


def test_tout_le_monde_passe_la_donne_tourne():
    game = table(3)
    seat_first_dealer(game, 0)
    nico, paul, lea = game.players
    engine.deal(game, nico, 2)
    for p in (paul, lea, nico):
        engine.bid(game, p, None)
    assert game.phase == "round_end" and game.round.result["void"]
    assert all(p.score == 0 for p in game.players)
    engine.next_round(game, paul)
    assert game.phase == "deal" and game.turn == paul.id


def test_dernier_a_parler_sans_enchere_peut_prendre():
    game = table(2)
    seat_first_dealer(game, 0)
    nico, paul = game.players
    engine.deal(game, nico, 1)
    engine.bid(game, paul, None)
    assert game.turn == nico.id
    engine.bid(game, nico, 5)
    assert game.phase == "trump" and game.round.taker == nico.id


def rig(game, hands, taker, value, trump):
    """Force une donne : mains imposées, enchère gagnée par `taker`."""
    dealer = game.player(game.turn)
    engine.deal(game, dealer, len(next(iter(hands.values()))))
    for name, hand in hands.items():
        by_name(game, name).hand = engine.sort_hand(hand, None)
    r = game.round
    r.high_bid, r.taker = value, by_name(game, taker).id
    game.phase, game.turn = "trump", r.taker
    engine.choose_trump(game, by_name(game, taker), trump)


def test_preneur_qui_tient_marque_un_point():
    game = table(2)
    seat_first_dealer(game, 0)
    rig(game, {"Nico": ["JS", "AH"], "Paul": ["7S", "7H"]}, "Nico", 40, "S")
    nico, paul = game.players
    engine.play(game, nico, "JS")
    engine.play(game, paul, "7S")
    engine.play(game, nico, "AH")
    engine.play(game, paul, "7H")
    res = game.round.result
    # 20 (valet d'atout) + 11 (as) + 10 de der = 41 >= 40
    assert res["points"][nico.id] == 41 and res["made"]
    assert (nico.score, paul.score) == (1, 0)


def test_preneur_qui_chute_donne_un_point_a_chacun_des_autres():
    game = table(3)
    seat_first_dealer(game, 0)
    rig(game, {"Nico": ["7C"], "Paul": ["AC"], "Léa": ["8C"]}, "Paul", 30, "H")
    nico, paul, lea = game.players
    engine.play(game, paul, "AC")
    engine.play(game, lea, "8C")
    engine.play(game, nico, "7C")
    res = game.round.result
    assert res["points"][paul.id] == 21 and not res["made"]
    assert (nico.score, paul.score, lea.score) == (1, 0, 1)


def test_belote_rebelote_compte_vingt():
    game = table(2)
    seat_first_dealer(game, 0)
    rig(game, {"Nico": ["KH", "QH"], "Paul": ["7C", "8C"]}, "Nico", 45, "H")
    nico, paul = game.players
    engine.play(game, nico, "KH")
    assert game.round.last_trick is None and game.round.trick[0]["say"] == "Belote"
    engine.play(game, paul, "7C")
    engine.play(game, nico, "QH")
    assert game.round.trick[0]["say"] == "Rebelote"
    engine.play(game, paul, "8C")
    # 4 + 3 + 20 de belote + 10 de der = 37 < 45
    assert game.round.result["points"][nico.id] == 37 and not game.round.result["made"]


def test_options_sans_der_ni_belote():
    game = table(2)
    game.dix_de_der = game.belote = False
    seat_first_dealer(game, 0)
    rig(game, {"Nico": ["KH", "QH"], "Paul": ["7C", "8C"]}, "Nico", 7, "H")
    nico, paul = game.players
    for c1, c2 in (("KH", "7C"), ("QH", "8C")):
        engine.play(game, nico, c1)
        engine.play(game, paul, c2)
    assert game.round.result["points"][nico.id] == 7 and game.round.result["made"]


def test_carte_interdite_refusee():
    game = table(2)
    seat_first_dealer(game, 0)
    rig(game, {"Nico": ["AH", "7C"], "Paul": ["7H", "AC"]}, "Nico", 1, "S")
    nico, paul = game.players
    engine.play(game, nico, "AH")
    with pytest.raises(GameError):
        engine.play(game, paul, "AC")
    with pytest.raises(GameError):
        engine.play(game, nico, "7C")  # pas son tour


def test_victoire_seul_en_tete_sinon_on_continue():
    game = table(3, target=3)
    seat_first_dealer(game, 0)
    nico, paul, lea = game.players
    nico.score, paul.score, lea.score = 2, 2, 1
    rig(game, {"Nico": ["7C"], "Paul": ["8C"], "Léa": ["AC"]}, "Léa", 100, "H")
    engine.play(game, lea, "AC")
    engine.play(game, nico, "7C")
    engine.play(game, paul, "8C")
    # Léa chute : Nico et Paul passent à 3 ensemble, égalité en tête : on continue
    assert game.phase == "round_end" and game.round.result["tie"]
    engine.next_round(game, nico)
    rig(game, {"Nico": ["AD"], "Paul": ["7D"], "Léa": ["8D"]}, "Nico", 1, "S")
    engine.play(game, nico, "AD")
    engine.play(game, paul, "7D")
    engine.play(game, lea, "8D")
    assert game.phase == "finished" and game.winners == [nico.id]
    engine.replay(game, nico)
    assert game.phase == "lobby"


def test_jouer_pour_un_absent():
    game = table(3)
    seat_first_dealer(game, 0)
    nico, paul, lea = game.players
    nico.connected = True
    engine.deal(game, nico, 3)
    paul.connected = True
    with pytest.raises(GameError):
        engine.stand_in(game, nico)  # Paul est là, c'est à lui
    engine.bid(game, paul, 10)
    engine.stand_in(game, nico)  # Léa absente : elle passe
    assert lea.passed and game.turn == nico.id


@pytest.mark.parametrize("seed", range(40))
def test_parties_au_hasard_vont_au_bout(seed):
    """Des joueurs qui jouent n'importe quelle carte permise : la partie doit finir,
    sans carte perdue ni dupliquée, avec un seul vainqueur."""
    rnd = random.Random(seed)
    game = table(rnd.randint(2, 6), target=rnd.choice(engine.TARGETS))
    engine.start(game, game.players[0])
    for _ in range(2000):
        if game.phase == "finished":
            break
        actor = game.player(game.turn)
        if game.phase == "deal":
            engine.deal(game, actor, rnd.randint(1, engine.max_cards(game)))
        elif game.phase == "bidding":
            r = game.round
            value = None if rnd.random() < 0.5 else r.high_bid + rnd.randint(1, 15)
            engine.bid(game, actor, value)
        elif game.phase == "trump":
            engine.choose_trump(game, actor, rnd.choice(engine.SUITS))
        elif game.phase == "playing":
            r = game.round
            engine.play(game, actor, rnd.choice(legal_cards(actor.hand, r.trick, r.trump)))
            if game.phase == "playing":
                seen = [c for p in game.players for c in p.hand + p.won] + [t["card"] for t in r.trick]
                assert len(seen) == len(set(seen)) == r.cards_each * len(game.players)
        elif game.phase == "round_end":
            engine.next_round(game, game.players[0])
    assert game.phase == "finished"
    top = max(p.score for p in game.players)
    assert top >= game.target and [p.id for p in game.players if p.score == top] == game.winners
