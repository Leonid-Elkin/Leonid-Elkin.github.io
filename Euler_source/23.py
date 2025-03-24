from math import sqrt

def isabundant(number):
    factorsum = 0
    for factor in range (2,int(sqrt(number)) + 1):
        if number % factor == 0:
            if factor ** 2 == number:
                factorsum += factor
            else:
                factorsum += factor
                factorsum += number // factor
    
    if factorsum > number:
        return True
    return False


sumy = 0
abundantlist = []

for abundantnum in range (12,28124):
    if isabundant(abundantnum):
        abundantlist.append(abundantnum)


for number in range (1,28124):
    found = True
    for abundantnum in abundantlist:
        if abundantnum >= number:
            pass
        elif isabundant(number - abundantnum):
            found = False

    if found:
        sumy += number 



print(sumy)
                