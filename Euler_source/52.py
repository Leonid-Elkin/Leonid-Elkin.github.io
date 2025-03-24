


def compare(str1,str2):

    for i in range (len(str1)):

        if str1[i] not in str2:

            return False
        
    return True

def multiplier(str1):

    for multiplier in range (1,7):

        tempdigitstring = int(str1) * multiplier
        tempdigitstring = str(tempdigitstring)

        if len(str1) != len(tempdigitstring):

            return False

        if compare(str(tempdigitstring),str(str1)) != True:

            return False
        
    return True

for number in range (2,252_000):

    if multiplier(str(number)) == True:

        print(number)
        
        