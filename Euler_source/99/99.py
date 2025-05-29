<<<<<<< HEAD

def getLength(string):

    for index,i in enumerate(string):
        if i == ",":
            return index

filename = "99/Data.txt.txt"

file = open(filename,'r')

data = file.readlines()

maxLine = 0
maxValue = 0

for lineid,line in enumerate(data):
    print(line)
    print(line[:2])

    print(line[7:9])
    largeSum = int(line[:2]) ** (int(line[7:9]))
    print(largeSum)
    if largeSum > maxValue:
        maxValue = largeSum
        maxLine = lineid

print(maxLine,lineid)
=======

def getLength(string):

    for index,i in enumerate(string):
        if i == ",":
            return index

filename = "99/Data.txt.txt"

file = open(filename,'r')

data = file.readlines()

maxLine = 0
maxValue = 0

for lineid,line in enumerate(data):
    print(line)
    print(line[:2])

    print(line[7:9])
    largeSum = int(line[:2]) ** (int(line[7:9]))
    print(largeSum)
    if largeSum > maxValue:
        maxValue = largeSum
        maxLine = lineid

print(maxLine,lineid)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
