import math

trianglist = []
pentlist = []
hexlist = []

for triangle in range (285,100_000):
    trianglist.append(triangle * (triangle + 1) // 2)

for pentagon in range (165,100_000):
    pentlist.append(pentagon * (3 * pentagon - 1) // 2)

for hexagon in range (143,100_000):
    hexlist.append(hexagon * (hexagon * 2 - 1))

for triangle in (trianglist):
    if triangle in pentlist:
        if triangle in hexlist:
            print(triangle)