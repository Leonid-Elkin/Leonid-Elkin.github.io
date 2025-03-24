fileData = open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler 1-50\\13\\Numbers.txt","r").read().split("\n")

sum = 0
for item in fileData:
    sum += int(item)

print(str(sum)[0:10])