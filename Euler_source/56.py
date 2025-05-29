<<<<<<< HEAD

def digitSum(number):
    numlst = str(number)
    sum = 0
    for number in numlst:
        sum += int(number)
    return sum


maxlength = 0
for number in range (1,101):
    for power in range (1,101):
        if digitSum(number ** power) > maxlength:
            maxlength = digitSum(number ** power)
=======

def digitSum(number):
    numlst = str(number)
    sum = 0
    for number in numlst:
        sum += int(number)
    return sum


maxlength = 0
for number in range (1,101):
    for power in range (1,101):
        if digitSum(number ** power) > maxlength:
            maxlength = digitSum(number ** power)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(maxlength)