index=2
previous=1
numb=1
placeholder=0
checklist=''

while len(checklist) != 1000:

    placeholder = numb
    numb = numb + previous
    previous = placeholder
    checklist = str(numb)
    index += 1

print(index)