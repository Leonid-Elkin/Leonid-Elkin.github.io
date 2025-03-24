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
