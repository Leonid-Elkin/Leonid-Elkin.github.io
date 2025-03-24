def factorial(number):
    multipler = 1
    
    for number in range (1,number+1):

        multipler *= number

    return multipler



sum = 0
numlist = ''

for number in range (3,1_000_000):
    check = 0
    numlist = str(number)

    for digit in range (int(len(numlist))):

        check += factorial(int(numlist[digit]))

    if check == number:

        sum += number

print(sum)