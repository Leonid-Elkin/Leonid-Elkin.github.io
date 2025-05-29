<<<<<<< HEAD
import math

def ispalindromic(number):
    numlist = str(number)

    for i in range (int(len(numlist) / 2)):

        if numlist[i] != numlist [-i-1]:

            return False
    
    return True

def nextsquare(number):

    number += math.sqrt(number) * 2 + 1
    return number
 
def checksquares(number):
    palin = number
    for square in range (1,int(math.sqrt(number)) // 2):
        
        while palin < int(math.sqrt(number)) // 2:
            
=======
import math

def ispalindromic(number):
    numlist = str(number)

    for i in range (int(len(numlist) / 2)):

        if numlist[i] != numlist [-i-1]:

            return False
    
    return True

def nextsquare(number):

    number += math.sqrt(number) * 2 + 1
    return number
 
def checksquares(number):
    palin = number
    for square in range (1,int(math.sqrt(number)) // 2):
        
        while palin < int(math.sqrt(number)) // 2:
            
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
            pass