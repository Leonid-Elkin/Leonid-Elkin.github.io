<<<<<<< HEAD

def ispalindromic(number):

    numlist = str(number)

    if int(numlist[0]) == 0:

        return False

    for i in range (int(len(numlist) / 2)):

        if numlist[i] != numlist [-i-1]:

            return False
    
    return True

def check(number):
    for i in range (50):
        numList = list(str(number))
        numList.reverse()
        revers = int("".join(numList))
                
        print(number,revers,number + revers)
        number += revers

        if ispalindromic(number):
            return False
    
    return True

print(check(4994))

number = 0

for i in range (10,10_000):
    if check(i):
        number += 1

print(number)
=======

def ispalindromic(number):

    numlist = str(number)

    if int(numlist[0]) == 0:

        return False

    for i in range (int(len(numlist) / 2)):

        if numlist[i] != numlist [-i-1]:

            return False
    
    return True

def check(number):
    for i in range (50):
        numList = list(str(number))
        numList.reverse()
        revers = int("".join(numList))
                
        print(number,revers,number + revers)
        number += revers

        if ispalindromic(number):
            return False
    
    return True

print(check(4994))

number = 0

for i in range (10,10_000):
    if check(i):
        number += 1

print(number)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
