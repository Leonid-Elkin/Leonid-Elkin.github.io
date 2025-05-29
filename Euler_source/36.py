<<<<<<< HEAD
import math

def checka(number):

    for checkid in range (len(number) // 2):

        if number[checkid] != number[-(checkid+1)]:

            return False
            break
    
    return True

def checkb(binary):

    for checkid in range ((len(binary)-2) // 2):

        if binary[checkid+2] != binary[-checkid-1]:

            return False
            break
    
    return True

sum = 0
binary = ''



for number in range (1_000_000):

    binary = bin(number)
    number = str(number)

    if checka(number) == checkb(binary) == True:

        sum += int(number)
        
print(sum)

=======
import math

def checka(number):

    for checkid in range (len(number) // 2):

        if number[checkid] != number[-(checkid+1)]:

            return False
            break
    
    return True

def checkb(binary):

    for checkid in range ((len(binary)-2) // 2):

        if binary[checkid+2] != binary[-checkid-1]:

            return False
            break
    
    return True

sum = 0
binary = ''



for number in range (1_000_000):

    binary = bin(number)
    number = str(number)

    if checka(number) == checkb(binary) == True:

        sum += int(number)
        
print(sum)

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
