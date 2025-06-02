from MLP import MLP
import numpy as np
import tensorflow_datasets as tfds
import matplotlib.pyplot as plt


def convertIntoFormat(labels, size): # One hot encode values
    format = np.zeros((len(labels), size)) # Create list of zeros of same length as number of classes
    for i, label in enumerate(labels): 
        format[i][label] = 1    # insert a one where nessesary
    return format


def checkAccuracy(lst1, lst2): # gets the accuracy of whether two items with the same indexes in two lists are the same
    result = []
    for a,b in zip(lst1,lst2):
        if a == b:
            result.append(1)
        else:
            result.append(0)
    return np.mean(np.array(result)) # takes mean of list of ones and zeros to get accuracy 

#'emnist/letters' (A-Z, a-z)

#'emnist/balanced' (digits + letters)

#'emnist/byclass' (full 62-class dataset)

def loadEMNIST():
    # Load EMNIST Balanced subset (47 classes: 0-9, A-Z, a-z)
    (train_ds, test_ds), ds_info = tfds.load(
        'emnist/balanced',
        split=['train', 'test'],
        shuffle_files=True,
        as_supervised=True,
        with_info=True
    )

    # Convert TFDS datasets to numpy arrays
    def extract_images_labels(ds):
        images, labels = [], []
        for img, lbl in tfds.as_numpy(ds):
            images.append(img)
            labels.append(lbl)
        return np.array(images), np.array(labels)

    trainingImages, trainingLabels = extract_images_labels(train_ds)
    testingImages, testingLabels = extract_images_labels(test_ds)

    # EMNIST-specific processing
    trainingImages = trainingImages.reshape(-1, 28 * 28).astype('float32') / 255.0
    testingImages = testingImages.reshape(-1, 28 * 28).astype('float32') / 255.0

    # Rotate and flip images (EMNIST characters are rotated 90° counter-clockwise and flipped)
    trainingImages = np.rot90(trainingImages.reshape(-1, 28, 28), k=-1, axes=(1, 2))
    trainingImages = np.flip(trainingImages, axis=2).reshape(-1, 28*28)
    
    testingImages = np.rot90(testingImages.reshape(-1, 28, 28), k=-1, axes=(1, 2))
    testingImages = np.flip(testingImages, axis=2).reshape(-1, 28*28)

    # One-hot encode (47 classes for balanced dataset)
    trainingLabels = convertIntoFormat(trainingLabels, 47)
    testingLabels = convertIntoFormat(testingLabels, 47)

    # Apply ceiling as in your MNIST example
    trainingImages = np.ceil(trainingImages)
    testingImages = np.ceil(testingImages)

    return trainingImages, testingImages, trainingLabels, testingLabels

def loadMNIST():
    from tensorflow.keras.datasets import mnist

    (trainingImages, trainingLabels), (testingImages, testingLabels) = mnist.load_data() #Loads 2D images and labels from keras. Automatically splits them into training and testing datasets.

    trainingImages = trainingImages.reshape(-1, 28 * 28) / 255.0
    testingImages = testingImages.reshape(-1, 28 * 28) / 255.0 # flattens both images to be compatible with the MLP
    trainingLabels = convertIntoFormat(trainingLabels, 10)
    testingLabels = convertIntoFormat(testingLabels, 10) # one-hot-encodes labels
    
    return trainingImages, testingImages, trainingLabels, testingLabels


def loadCIFAR():

    #Change number of input nodes to 3072

    from tensorflow.keras.datasets import cifar10

    (trainingImages, trainingLabels), (testingImages, testingLabels) = cifar10.load_data()

    trainingImages = trainingImages.reshape(-1, 32 * 32 * 3) / 255.0
    testingImages = testingImages.reshape(-1, 32 * 32 * 3) / 255.0
    trainingLabels = convertIntoFormat(trainingLabels, 10)
    testingLabels = convertIntoFormat(testingLabels, 10)

    return trainingImages, testingImages, trainingLabels, testingLabels

def loadFashionMNIST():
    from tensorflow.keras.datasets import fashion_mnist # import dataset
    (trainingImages, trainingLabels), (testingImages, testingLabels) = fashion_mnist.load_data() # load dataset into lists

    trainingImages = trainingImages.reshape(-1, 28 * 28) / 255.0
    testingImages = testingImages.reshape(-1, 28 * 28) / 255.0 # flatten image into list and divide each pixel value by 255 to make them between one and zero
    trainingLabels = convertIntoFormat(trainingLabels, 10)
    testingLabels = convertIntoFormat(testingLabels, 10) # one-hot-encode all labels

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

def trainBestEMNIST():

    LAYERS = [784,1024 + 512,47]       
    maxAllowableOutput = 200
    epochs = 10
    lr = 0.01
    batchSize = 25
    seed = 100

    mlp = MLP(LAYERS,'relu',maxAllowableOutput,'he',seed,'cross')
    mlp.load(savefile)
    mlp.train(trainingImages,trainingLabels,epochs,lr,batchSize,testingImages,testingLabels,lrDecay=True,decayRate=0.5)
    return mlp

def trainBestFashionMNIST():
    #Best accuracy I got is 0.8967

    LAYERS = [784,512,128,10]       
    maxAllowableOutput = 500
    epochs = 22
    lr = 0.01
    batchSize = 50
    seed = 104

    mlp = MLP(LAYERS,'relu',maxAllowableOutput,'he',seed,lossFunc='cross')
    mlp.train(trainingImages,trainingLabels,epochs,lr,batchSize,testingImages,testingLabels,0.9,False,False,False,False)
    return mlp

def showImg(flatImage) -> None:
    #displays the image through matplotlib. Used for debugging

    image = flatImage.reshape(28, 28)
    plt.imshow(image, cmap='gray')
    plt.show()


def trainBestCIFAR():
    layers = [3072,512,10]
    maxAllowableOutput = 500
    epochs = 3
    lr = 0.01
    batchSize = 64
    seed = 100

    mlp = MLP(layers,'relu',maxAllowableOutput,'he',seed,"cross")
    mlp.train(trainingImages,trainingLabels,epochs,lr,batchSize,testingImages,testingLabels,0.9)

    return mlp


trainingImages, testingImages, trainingLabels, testingLabels = loadCIFAR()

savefile = 'Elkwork_trainer_source/save.txt.txt'

print("Training init")


mlp = trainBestCIFAR()
mlp.save(savefile)

answers = mlp.predict(trainingImages)
trueAnswers = np.argmax(trainingLabels, axis=1)
accuracy = checkAccuracy(answers,trueAnswers)

print(accuracy)

print("network has completed training. Parameters stored into the save file.")
