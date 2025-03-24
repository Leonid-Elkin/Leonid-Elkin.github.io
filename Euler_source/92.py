
def checkchain(number):
    while number != 1 and number != 89:
        numstr = str(number)
        newnum = 0
        for digit in numstr:
            newnum += int(digit) ** 2
        number = newnum
    
    return number


count = 0

for number in range (1,10000000):
    chain = checkchain(number)
    if chain == 89:
        count += 1

print(count)