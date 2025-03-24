from math import sqrt

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

def checkifconc(ognum,testnum):
    numstr = str(ognum)
    teststr = str(testnum)

    for digit in numstr:
        if digit not in teststr:
            return False
    for digit in teststr:
        if digit not in numstr:
            return False
    return True

def check(number,adder) -> bool:
    ogdig = number
    for i in range (3):
        if isPrime(number + adder * i) and checkifconc(ogdig,adder * i + number) and (adder * i + number) < 10000:
            pass
        else:
            return False
        
    return True

    

ogdig = 1487
adder = 3330



for ogdig in range (1000,10000):
    for adder in range (1000,10000):
        if check(ogdig,adder):
            print(ogdig,adder+ogdig,ogdig + 2*adder)

"""""
3533 6053 8573
3733 5743 7753
3733 6733 9733
3803 6803 9803
3833 5843 7853
3833 6833 9833
4441 5641 6841
4441 6451 8461
4441 6841 9241
"""