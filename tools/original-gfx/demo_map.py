from civmap import *

def args():
    ROWS = [
     '~~~~~~~~~~~~~~~~',
     '~~~~~~~~~~~~~~~~',
     '~~~gggrff~~~~~~~',
     '~~gpggrhmm~~~~~~',
     '~~gpggrfhmm~~t~~',
     '~~~ggprrdd~~~a~~',
     '~~~jsgppdd~g~~~~',
     '~~~~jj~~~~~~~~~~',
     '~~~~~~~~~~~~~~~~',
     '~~~~~~~~~~~~~~~~',
    ]
    CODE = {'~': WATER, 'g': GRASS, 'p': PLAINS, 'd': DESERT, 'f': FOREST, 'j': JUNGLE, 'h': HILLS,
            'm': MOUNTAINS, 't': TUNDRA, 'a': ARCTIC, 's': SWAMP, 'r': RIVER}
    terrain = [[CODE[c] for c in row] for row in ROWS]
    specials = [(3, 4), (7, 2), (8, 4), (9, 3), (9, 6), (4, 7), (10, 3), (3, 8), (13, 5)]
    cities = [(4, 4, 3, 5)]
    units = [(3, 3, 3, 3), (6, 6, 3, 0), (1, 5, 3, 16), (11, 6, 0, 2), (5, 3, 3, 6), (4, 4, 3, 2)]
    return terrain, specials, cities, units
