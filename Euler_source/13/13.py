<<<<<<< HEAD
fileData = open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler 1-50\\13\\Numbers.txt","r").read().split("\n")

sum = 0
for item in fileData:
    sum += int(item)

=======
fileData = open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler 1-50\\13\\Numbers.txt","r").read().split("\n")

sum = 0
for item in fileData:
    sum += int(item)

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(str(sum)[0:10])