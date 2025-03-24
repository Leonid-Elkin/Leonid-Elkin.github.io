def checkInc(number):
    numList = list(str(number))
    for index in range(len(numList) - 1):
    #    print(numList[index], numList[index + 1])
        if numList[index] < numList[index + 1]:
            return False
    return True

def checkRed(number):
    numList = list(str(number))
    for index in range(len(numList) - 1):
 #       print(numList[index], numList[index + 1])
        if numList[index] > numList[index + 1]:
            return False
    return True

counter = 0
probs = 0
number = 100





while probs <= 0.99:

    if checkRed(number) == False and checkInc(number) == False:
        counter += 1
        probs = counter/number
    number += 1
print(number - 2)

