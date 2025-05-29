<<<<<<< HEAD
from math import sqrt

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

numberchecked = 1
index = 0

while index != 10001:
    numberchecked += 1
    if isPrime(numberchecked):
        index += 1

print(numberchecked)
=======
from math import sqrt

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

numberchecked = 1
index = 0

while index != 10001:
    numberchecked += 1
    if isPrime(numberchecked):
        index += 1

print(numberchecked)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
