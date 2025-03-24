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
