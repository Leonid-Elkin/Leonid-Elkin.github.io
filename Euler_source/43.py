
def isConcentrated(number):
    numstr = str(number)
    for trynum in range (0,10):
        if str(trynum) not in numstr:
            return False
    return True

def check(number,primeList):
    number = list(str(number))
    for index, item in enumerate(primeList):
        if (int(number[index + 1] + number[index + 2] + number[index + 3])) % int(item) != 0:
            return False
    return True


primelist = [2,3,5,7,11,13,17]
sum = 0

for number in range (1023456789,9876543211):
    if isConcentrated(number):
        if check(number,primelist):
            print(number)
            sum += number

print(sum)
