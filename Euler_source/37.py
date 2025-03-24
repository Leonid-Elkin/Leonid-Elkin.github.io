from math import sqrt

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

def check(numb):
    strnumber = str(numb)

    for i in range (len(strnumber)):
        if isPrime(int(strnumber[i:])) == False or isPrime(int(strnumber[:i + 1])) == False:
            return False
    
    return True

nums_to_check = 26 #supposed to be only 11 such numbers 
currentnum = 10
numsum = 0

while nums_to_check != 0:
    if check(currentnum):
        numsum += currentnum
        nums_to_check -= 1
    currentnum += 1

print(numsum)


