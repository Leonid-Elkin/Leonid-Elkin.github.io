<<<<<<< HEAD
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

=======
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

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(index)