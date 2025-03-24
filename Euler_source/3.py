from math import sqrt

largestFactor=0
largeNumber=600851475143

for number in range(3,int(sqrt(largeNumber)) + 1,2):

    while largeNumber % number == 0:
        if largestFactor < number:
            largestFactor = number
        largeNumber = largeNumber // number

print(largestFactor)
