<<<<<<< HEAD
from math import sqrt

largestFactor=0
largeNumber=600851475143

for number in range(3,int(sqrt(largeNumber)) + 1,2):

    while largeNumber % number == 0:
        if largestFactor < number:
            largestFactor = number
        largeNumber = largeNumber // number

print(largestFactor)
=======
from math import sqrt

largestFactor=0
largeNumber=600851475143

for number in range(3,int(sqrt(largeNumber)) + 1,2):

    while largeNumber % number == 0:
        if largestFactor < number:
            largestFactor = number
        largeNumber = largeNumber // number

print(largestFactor)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
