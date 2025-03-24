import math

def isprime(numbe):
    if numbe < 0:
        number = numbe * -1
    else:
        number = numbe
    for factor in range (2,int(math.sqrt(number)) - 1):
        if number % factor == 0:
            return False
    return True

def checkforprimes(ko1,ko2):
    counter = 0
    nvalue = -1
    while True:
        nvalue += 1
        if isprime(nvalue ** 2 + ko1 * nvalue + ko2):
            counter += 1
        else:
            return counter

maxi = 0
for a in range (-1000,1000):
    for b in range (-1000,1001):
        counter = checkforprimes(a,b)
        if counter > maxi:
            maxi = counter
            print(a,b,a*b,maxi)