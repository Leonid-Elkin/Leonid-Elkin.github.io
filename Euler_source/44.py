<<<<<<< HEAD
pentlist = []

def check(Pone,Ptwo,pentlist):

    if Pone in pentlist and Ptwo in pentlist:

        if Pone - Ptwo in pentlist:

            if Pone + Ptwo in pentlist:

                return True
    
    return False

for pentagon in range (10_000):
    pentlist.append(pentagon * (3 * pentagon - 1) // 2)

for k1 in range (1,10_000):
    for k2 in range (1,k1):
        pent1 = k1 * (3 * k1 - 1) // 2
        pent2 = k2 * (3 * k2 - 1) // 2
        if check(pent1,pent2,pentlist):
=======
pentlist = []

def check(Pone,Ptwo,pentlist):

    if Pone in pentlist and Ptwo in pentlist:

        if Pone - Ptwo in pentlist:

            if Pone + Ptwo in pentlist:

                return True
    
    return False

for pentagon in range (10_000):
    pentlist.append(pentagon * (3 * pentagon - 1) // 2)

for k1 in range (1,10_000):
    for k2 in range (1,k1):
        pent1 = k1 * (3 * k1 - 1) // 2
        pent2 = k2 * (3 * k2 - 1) // 2
        if check(pent1,pent2,pentlist):
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
            print(pent1,pent2)