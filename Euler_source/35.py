import math

def isprime(number):
    number = int(number)

    for check in range (2,int(math.sqrt(number)) + 1):

        if number % check == 0:

            return False
        
    return True

def rotate(number):
    string = str(number)
    newlist = []
    newlist = list(string)
    tempvar = newlist[0]
    newlist.append(tempvar)
    newlist.pop(0)
    answer = int(''.join(newlist))
    return answer

def checkRotations(number):
    numy = number
    numstr = str(number)
    if ('2' in numstr or '5' in numstr or '0' in numstr) and numy > 10:
        return False
    for rotation in range (len(numstr)):
        if isprime(numy):
            numy = rotate(numy)
        else:
            return False
    return True

count = 0

for number in range (2,1_000_000):
    if checkRotations(number) == True:
        count += 1

print(count)
