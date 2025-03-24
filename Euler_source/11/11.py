def CheckHorisontal(table):
    largestProduct = 0

    for line in table:
        for startIndex in range (len(line) - 4):
            sum = 1
            for index in range (4):
                sum *= int(line[startIndex + index])
            if sum > largestProduct:
                largestProduct = sum
    return largestProduct

def CheckVertical(table):
    largestProduct = 0

    for lineID in range (len(table)):
        for startIndex in range (len(table[lineID]) - 4):
            sum = 1
            for index in range (4):
                sum *= int(table[startIndex + index][lineID])
            if sum > largestProduct:
                largestProduct = sum
    return largestProduct

def CheckDiagonal(table):
    largestProduct = 0

    for lineID in range (len(table)):
        for startIndex in range (len(table[lineID]) - 4):
            sum = 1
            for index in range (4):
                sum *= int(table[startIndex + index][lineID + index])
            if sum > largestProduct:
                largestProduct = sum
    return largestProduct
        


fileId = "C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler\\11\\Numbers.txt"

file = open(fileId, 'r').read().split('\n')
maxProduct = 0

for itemID in range (len(file)):
    file[itemID] = file[itemID].split(" ")

print(CheckVertical(file))
