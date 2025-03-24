def checker(number):
    temp = ''
    temp = str(number)
    total = 0
    counter=0

    for digit in range (len(temp)):

        counter += int(temp[digit])**5
        
    if counter == number:

        return True
    
    else:

        return False
    
numsum=0
for number in range (2,(9**5*10+1)):

    if checker(number) == True:

        numsum += number

print(numsum)

