
def isReversible(number):
    numList = list(str(number))
    numList.reverse()
    for index in range(numList):
        numList[index] * 10 ** index
    numList = sum(numList)
    





