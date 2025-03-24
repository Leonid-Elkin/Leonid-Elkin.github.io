
namelist = open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler 1-50\\22\\Names.txt","r").read().strip().split('","')
print(namelist)

sum = 0
index = 0
namelist.sort()
def check(lst):
    namestring = str(lst)
    sum = 0

    for members in namestring:

        sum += ord(members) - 64

    return sum

for member in namelist:

    index += 1
    sum += check(member) * index

print(sum)
