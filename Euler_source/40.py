<<<<<<< HEAD
largelist = []
for i in range (1,1_000_000):
    istr = str(i)
    for j in istr:
        largelist.append(j)

number = 1
for mult in range(0,7):
    number *= int(largelist[10 ** mult - 1])
=======
largelist = []
for i in range (1,1_000_000):
    istr = str(i)
    for j in istr:
        largelist.append(j)

number = 1
for mult in range(0,7):
    number *= int(largelist[10 ** mult - 1])
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(number)