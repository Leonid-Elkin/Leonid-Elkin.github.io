<<<<<<< HEAD
from math import sqrt

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

sum = 0
currentNum = 2

while currentNum < 2_000_000:
    if isPrime(currentNum):
        sum += currentNum
    currentNum += 1

=======
from math import sqrt

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

sum = 0
currentNum = 2

while currentNum < 2_000_000:
    if isPrime(currentNum):
        sum += currentNum
    currentNum += 1

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(sum)