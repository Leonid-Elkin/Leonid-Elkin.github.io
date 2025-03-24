from math import sqrt

def isPrime(number):
    if number == 0:
        return False
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

def checkNum(number,factorList = None):
    if factorList == None:
        factorList = []
    if number == 0:
        return len(set(factorList))
    else:
        for prime in primelist:
            if number % prime == 0:
                factorList.append(prime)
                number = number // prime
                checkNum(number,factorList)
                return len(set(factorList))
            
primeListLength = 100000

primelist = []

for i in range (2,primeListLength):
    if isPrime(i):

        primelist.append(i)

number = 10
buffer = []

while number != 200000:
    if checkNum(number) == 4:
        buffer.append(number)
        if len(buffer) == 4:
            print(buffer)
            quit()
    else:
        buffer = []
    number += 1


    
