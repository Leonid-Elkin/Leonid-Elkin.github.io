<<<<<<< HEAD
from itertools import permutations
from itertools import combinations
import math

def isprime(number):
    if number == 1:
        return False

    number = int(number)

    for check in range (2,int(math.sqrt(number)) + 1):

        if number % check == 0:

            return False
        
    return True

def check(numList):
    combs = permutations(numList,2)
    comb = [int(str(x[1]) + str(x[0])) for x in combs]
    for item in comb:
        if isprime(item) == False:
            return False
    return True

primeList = []

for i in range (1,1000):
    if isprime(i):
        primeList.append(i)

    

testcases = combinations(primeList,5)

print("cases done")


for item in testcases:
    if check(item):
        print(item)
        print(sum(item))
=======
from itertools import permutations
from itertools import combinations
import math

def isprime(number):
    if number == 1:
        return False

    number = int(number)

    for check in range (2,int(math.sqrt(number)) + 1):

        if number % check == 0:

            return False
        
    return True

def check(numList):
    combs = permutations(numList,2)
    comb = [int(str(x[1]) + str(x[0])) for x in combs]
    for item in comb:
        if isprime(item) == False:
            return False
    return True

primeList = []

for i in range (1,1000):
    if isprime(i):
        primeList.append(i)

    

testcases = combinations(primeList,5)

print("cases done")


for item in testcases:
    if check(item):
        print(item)
        print(sum(item))
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
        quit()