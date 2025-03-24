from math import sqrt
from itertools import permutations

def isPrime(number):
    for factor in range (2,int(sqrt(number)) + 1):
        if number % factor == 0:
            return False
    return True

def checkPandigital(number):
    if isPrime(number):
        return (len(str(number)))
    return 0
    
maxi = 0
maxinum = 0
for amount in range (1,10):
    numlst = []
    for i in range (1,amount + 1):
        numlst.append(i)
        number = 0

    for j in range (len(numlst)):
        number += numlst[j] * 10 ** j

    permu = permutations(numlst)
    for iteration in permu:
        iter = list(iteration)
        pannumber = 0

        for j in range (len(iter)):
             pannumber += iter[j] * 10 ** j

        check = checkPandigital(pannumber)
        if check >= maxi:    
            maxi = check
            if maxinum < pannumber:
                maxinum = pannumber 
            print(maxi,maxinum)
        


    
    