<<<<<<< HEAD
from math import ceil

def checkPalindromic(number):
    number = list(str(number))
    for index in range (ceil(len(number) / 2)):
        if number[index] != number[-(index + 1)]:
            return False
    return True

largestNumber = 0

for numberOne in range (100,1000):
    for numberTwo in range (100,1000):
        newNumber = numberOne * numberTwo
        if checkPalindromic(newNumber):
            if newNumber > largestNumber:
                largestNumber = newNumber

print(largestNumber)
=======
from math import ceil

def checkPalindromic(number):
    number = list(str(number))
    for index in range (ceil(len(number) / 2)):
        if number[index] != number[-(index + 1)]:
            return False
    return True

largestNumber = 0

for numberOne in range (100,1000):
    for numberTwo in range (100,1000):
        newNumber = numberOne * numberTwo
        if checkPalindromic(newNumber):
            if newNumber > largestNumber:
                largestNumber = newNumber

print(largestNumber)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
