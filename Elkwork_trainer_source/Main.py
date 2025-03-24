from elkwork import MLP
import numpy as np
import numpy as np

def convertIntoFormat(labels, size): # One hot encode values
    format = np.zeros((len(labels), size)) # Create list of zeros of same length as numbe of classes
    for i, label in enumerate(labels): 
        format[i][label] = 1    # insert a one where nessesary
    return format


def checkAccuracy(lst1, lst2): # gets the acuracy of whether two items with the same indexes in two lists are the same
    result = []
    for a,b in zip(lst1,lst2):
        if a == b:
            result.append(1)
        else:
            result.append(0)
    return np.mean(np.array(result)) # takes mean of list of ones and zeros to get accuracy 

def loadMNIST():
    from tensorflow.keras.datasets import mnist

    (trainingImages, trainingLabels), (testingImages, testingLabels) = mnist.load_data()

    trainingImages = trainingImages.reshape(-1, 28 * 28) / 255.0
    testingImages = testingImages.reshape(-1, 28 * 28) / 255.0
    trainingLabels = convertIntoFormat(trainingLabels, 10)
    testingLabels = convertIntoFormat(testingLabels, 10)

    trainingImages = np.ceil(trainingImages)
    testingImages = np.ceil(testingImages)

    return trainingImages, testingImages, trainingLabels, testingLabels

def trainBestMNIST():
    
    LAYERS = [784,925,10]       
    maxAllowableOutput = 9e9
    epochs = 15
    lr = 0.01
    batchSize = 50
    seed = 100

    mlp = MLP(LAYERS,'relu',maxAllowableOutput,'he',seed,'cross')
    mlp.train(trainingImages,trainingLabels,epochs,lr,batchSize,testingImages,testingLabels,lrDecay=True,decayRate=0.9)
    return mlp


trainingImages, testingImages, trainingLabels, testingLabels = loadMNIST()
savefile = 'save.txt'

mlp = trainBestMNIST()
mlp.save(savefile)

print("network has completed training. Parameters stored into the save file.")
