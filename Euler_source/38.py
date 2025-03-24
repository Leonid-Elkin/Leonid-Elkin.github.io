import math

def isValid(numstring):
    numlist = list(numstring)
    numlist.sort()
    if numlist == ['1','2','3','4','5','6','7','8','9']:
        return 1
    else:
        if len(numlist) > 9:
            return 2
        else:
            return 3

def compile(input):
    numberstring = ''
    while True: 
        for multiplier in range (1,10):
            numberstring += str(input * multiplier)
            valid = isValid(numberstring)
            if valid == 1:
                return int(numberstring)
            elif valid == 2:
                return 0
            
largest = 0

for number in range (1,500000):
    comple = compile(number)
    if compile == 0:
        pass
    else:
        if largest < comple:
            largest = comple
            print(largest)
