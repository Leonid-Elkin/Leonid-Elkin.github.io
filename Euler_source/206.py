import math


def isprime(number):
    if number == 1:
        return False

    number = int(number)

    for check in range (2,int(math.sqrt(number)) + 1):

        if number % check == 0:

            return False
        
    return True

