
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
print(maxlength)