<<<<<<< HEAD
import math

def gensum(number):
    sum = 0
    factlist = []
    for factor in range (1,int(math.sqrt(number) + 1)):

        if number % factor == 0:

            if factor * factor == number or factor == 1:
                factlist.append(factor)

            else:
                factlist.append(factor)
                factlist.append(number / factor)
    
    for item in factlist:
        sum += int(item)

    return sum


sum = 0
for firstnum in range (1,10_000):
    secondnum = gensum(firstnum)
    if firstnum != secondnum:
        if gensum(secondnum) == firstnum:
            sum += firstnum
=======
import math

def gensum(number):
    sum = 0
    factlist = []
    for factor in range (1,int(math.sqrt(number) + 1)):

        if number % factor == 0:

            if factor * factor == number or factor == 1:
                factlist.append(factor)

            else:
                factlist.append(factor)
                factlist.append(number / factor)
    
    for item in factlist:
        sum += int(item)

    return sum


sum = 0
for firstnum in range (1,10_000):
    secondnum = gensum(firstnum)
    if firstnum != secondnum:
        if gensum(secondnum) == firstnum:
            sum += firstnum
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(sum)