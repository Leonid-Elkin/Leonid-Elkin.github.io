from math import sqrt

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True



Primelist = []
numlist = []
notfound = True
number = 0

while notfound:
    number += 1
    numlist.append(number)
    if isPrime(number):
        Primelist.append(number)
    else:
        if number % 2 == 1:
            notfound = False
            for prime in Primelist:
                for squarenum in numlist:
                    if number == prime + 2 * (squarenum ** 2):
                        notfound = True
                        break
                else:
                    continue
                break


print(number)

