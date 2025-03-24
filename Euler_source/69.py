import math

def isPrime(number):
    for factor in range (2,int(math.sqrt(number)) + 1):
        if number % factor == 0:
            return False
    return True

