def args():
    rows = [
     '================',
     '==~~~~~~~~~=====',
     '=~~ggggff~~~~===',
     '=~gpggghmm~~~~==',
     '=~gpgggfhmm~~t~=',
     '=~~ggpggdd~~~a~=',
     '==~jsgppdd~g~~~=',
     '==~~jj~~~~~~~===',
     '===~~~~~~~======',
     '================',
    ]
    rivers = {(6, 2), (6, 3), (6, 4), (7, 5), (6, 5)}
    BLUE, RED = (52, 96, 214), (206, 60, 44)
    specials = [('ts.wheat:0', 3, 4), ('ts.forest_game:0', 7, 2), ('ts.coal:0', 8, 4), ('ts.gold:0', 9, 3),
                ('ts.oasis:0', 9, 6), ('ts.gems:0', 4, 7), ('ts.fish:0', 10, 3), ('ts.whales:0', 3, 8), ('ts.seals:0', 13, 5)]
    cities = [('city.classical_city_1:0', 5, BLUE, 4, 4)]
    units = [('u.legion_Idle:0', BLUE, 3, 3), ('u.settlers_Idle:0', BLUE, 6, 6), ('u.trireme_Idle:0', BLUE, 1, 5),
             ('u.phalanx_Idle:0', RED, 11, 6), ('u.horsemen_Idle:0', BLUE, 5, 3)]
    rows = [r.replace('=', '~') for r in rows]  # jeden typ oceanu, jak w oryginale
    return rows, rivers, specials, cities, units
