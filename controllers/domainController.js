const multer = require("multer");
const path = require("path");
const connection = require("../utility/connection"); // Ensure your DB connection logic is correct
const fs = require("fs");
const { timeLog, error } = require("console");

// Make sure the 'uploads' directory exists
const dir = "./uploads";
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

// Configure multer for handling file and image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads"); // Files will be uploaded to 'uploads' folder
  },
  filename: (req, file, cb) => {
    const { title } = req.body; // Get domain title from the request body

    if (file.fieldname === "image") {
      // For images, keep the original filename (no prefix)
      const originalFileName = path.basename(file.originalname); // Get original filename
      cb(null, originalFileName); // Use the original name for the image
    } else {
      // Prefix the domain title to the file name
      const uniqueName = `${title}_${file.originalname}`;
      cb(null, uniqueName); // Set the filename with the domain title as prefix
    }
  },
});

const fileFilter = (req, file, cb) => {
  // Allow image file types and Excel file types (xlsx, xls)
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
  ];

  if (allowedTypes.includes(file.mimetype)) {
    // Accept the file
    cb(null, true);
  } else {
    // Reject the file if it's not allowed
    cb(null, false); // cb should be a function, correctly called here
  }
};

// Initialize multer with storage and fileFilter configuration
const upload = multer({ storage, fileFilter });

// POST route for file and form data upload
const createDomain = async (req, res) => {
  // Use upload middleware to handle the files for this specific route
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ])(req, res, async (err) => {
    if (err) {
      return res.json({
        message: "Error during file upload.",
        error: err.message,
      });
    }

    try {
      // Access uploaded files and form fields
      const { file, image } = req.files;
      const { title, url, description } = req.body;

      // Ensure both files are uploaded
      if (!file || !image) {
        return res.json({ message: "Both file and image are required" });
      }

      // Connect to MongoDB and check if domain already exists
      const mongo = connection.getDB();
      const domainsCollection = mongo.collection("domains");
      const domain = await domainsCollection.findOne({ title });

      if (domain) {
        return res.json({
          status: "failed",
          message: "Domain already exists.",
        });
      }

      // Prepare the data to insert into MongoDB
      const domainData = {
        title,
        url,
        description,
        fileName: path.basename(file[0].filename,path.extname(file[0].filename)),
        mapperFile_Url: file[0].path, // Save the filePath for the file
        imagePath: image[0].path, // Save the imagePath for the image
      };

      // Insert the domain data into MongoDB
      await domainsCollection.insertOne(domainData);

      // Send success response
      return res.json({
        status: "success",
        message: "Domain created successfully.",
      });
    } catch (error) {
      console.error("Error in file upload and database insertion:", error);
      return res.json({ message: "Server error", error: error.message });
    }
  });
};

//get domain by id
const getDomain = async (req, res) => {
  const id = req.params.id;
  console.log(id);
  const mongoDB = connection.getDB();
  const domainsCollection = mongoDB.collection("domains");
  const domain = await domainsCollection.findOne({
    _id: connection.getObjectId(id),
  });
  if (!domain) {
    return res.json({
      status: "failed",
      message: "domain not found with the given id.",
    });
  }
  return res.json({ status: "success", domain: domain });
};

// get all domains
const getAllDomains = async (req, res) => {
  const mongoDB = connection.getDB();
  const domainsCollection = mongoDB.collection("domains");
  const domainDocs = await domainsCollection.find({});
  const domArray = await domainDocs.toArray();
  const domains = domArray.map((domain) => {
    return { ...domain };
  });

  if (!domains) {
    return res.json({
      status: "failed",
      message: "No domains found with the given id.",
    });
  }
  return res.json({ domains: domains });
};

//delete a domain
const deleteDomain = async (req, res) => {
  const id = req.params.id;
  console.log("Domain ID:", id);
  const mongoDB = connection.getDB();
  const domainsCollection = mongoDB.collection("domains");

  // Step 1: Fetch the document first
  const domain = await domainsCollection.findOne({
    _id: connection.getObjectId(id),
  });

  if (!domain) {
    return res.json({
      status: "failed",
      message: "Domain not found with the given id.",
    });
  }

  console.log("Domain document found:", domain);

  // Retrieve file paths
  const filePath = domain.mapperFile_Url;
  const imagePath = domain.imagePath;

  // Set the base directory explicitly to the project root
  const fullFilePath = path.join(__dirname, "..", filePath); 
  const fullImagePath = path.join(__dirname, "..", imagePath); 

  // Delete files
  const response = await deleteFiles([fullFilePath, fullImagePath]);

  if (response.status === "failed") {
    return res.json({
      status: "failed",
      message: response.message,
    });
  }

  // Delete the document after the files have been deleted
  const result = await domainsCollection.findOneAndDelete({
    _id: connection.getObjectId(id),
  });

  if (!result) {
    return res.json({
      status: "failed",
      message: "Error deleting the domain document.",
    });
  }

  // Return success response with the deleted domain data
  return res.json({
    status: "success",
    message: "Domain and its associated files deleted successfully.",
  });
};

// Delete files using file paths
const deleteFiles = async (paths) => {
  const pathsArray = Array.isArray(paths) ? paths : [paths]; // Ensure paths are always an array

  let allSuccess = true; // Track if all deletions were successful
  const results = [];

  console.log("Deleting files: ", pathsArray); // Log the paths before deletion

  for (const filePath of pathsArray) {
    try {
      // Normalize the file path and check if the file exists using fs.access before trying to delete
      const normalizedPath = path.normalize(filePath);
      console.log(`Normalized file path: ${normalizedPath}`);

      await fs.promises.access(normalizedPath); // This checks if the file exists and is accessible
      await fs.promises.unlink(normalizedPath); // Delete the file if accessible

      results.push({
        path: normalizedPath,
        status: "success",
      });
    } catch (err) {
      results.push({
        path: filePath,
        status: "failed",
        error: err.message,
      });
      allSuccess = false;
    }
  }

  if (allSuccess) {
    return {
      status: "success",
      message: "All files successfully deleted",
    };
  } else {
    return {
      status: "failed",
      message: `Error deleting file: ${
        results.find((result) => result.status === "failed").error
      }`,
    };
  }
};

//update domain
const updateDomain = async (req, res) => {
  // Use upload middleware to handle the files for this specific route
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ])(req, res, async (err) => {
    if (err) {
      return res.json({
        message: "Error during file upload.",
        error: err.message,
      });
    }

    try {
      // Access uploaded files and form fields
      const { file, image } = req.files;
      const {id, title, url, description } = req.body;

      // Check if id is provided for update
      if (!id) {
        console.log("id is missing, cannot update domain.");
        return res.json({ message: "id is required to update the domain." });
      }

      // Connect to MongoDB and fetch the existing domain
      const mongo = connection.getDB();
      const domainsCollection = mongo.collection("domains");
      const domain = await domainsCollection.findOne({_id: connection.getObjectId(id)});

      if (!domain) {
        console.log(`Domain not found with the given id.`);
        return res.json({
          status: "failed",
          message: "Domain not found with the given id.",
        });
      }

      // updated data for the domain
      const updatedData = {
        url: url || domain.url, // Keep the old URL if not updated
        description: description || domain.description, // Keep old description if not updated
        title: title || domain.title // Keep old title if not updated
      };

      let newFileUploaded = false;
      let newImageUploaded = false;

      // Check if a new file is uploaded and its filename is different from the old one
      if (file) {
        const newFileName = path.basename(file[0].filename, path.extname(file[0].filename));
        const oldFileName = path.basename(domain.fileName, path.extname(domain.fileName));

        // If the file name is the same as the previous file, skip deletion and update
        if (newFileName === oldFileName) {
          console.log('Uploaded file has the same name as the existing file, skipping update.');
          updatedData.mapperFile_Url = domain.mapperFile_Url; // Keep the old file URL
        } else {
          console.log('Uploaded file has a different name. Replacing the old file.');
          // If the file is different, upload the new file before deleting the old one
          updatedData.fileName = newFileName; // New file name
          updatedData.mapperFile_Url = file[0].path; // New file path
          newFileUploaded = true;
        }
      }

      // Check if a new image is uploaded and its filename is different from the old one
      if (image) {
        const newImageName = path.basename(image[0].filename, path.extname(image[0].filename));
        const oldImageName = path.basename(domain.imagePath, path.extname(domain.imagePath));

        // If the image name is the same as the previous image, skip deletion and update
        if (newImageName === oldImageName) {
          console.log('Uploaded image has the same name as the existing image, skipping update.');
          updatedData.imagePath = domain.imagePath; // Keep the old image path
        } else {
          console.log('Uploaded image has a different name. Replacing the old image.');
          // If the image is different, upload the new image before deleting the old one
          updatedData.imagePath = image[0].path; // New image path
          newImageUploaded = true;
        }
      }

      // Only proceed to delete old files after ensuring the new files have been uploaded
      if (newFileUploaded && domain.mapperFile_Url) {
        const oldFilePath = path.join(__dirname, '..', domain.mapperFile_Url);
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath); // Delete old file from server
            console.log(`Old file deleted: ${domain.mapperFile_Url}`);
          } catch (error) {
            console.error('Error deleting old file:', error);
          }
        } else {
          console.log('Old file does not exist:', oldFilePath);
        }
      }

      if (newImageUploaded && domain.imagePath) {
        const oldImagePath = path.join(__dirname, '..', domain.imagePath);
        if (fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath); // Delete old image from server
            console.log(`Old image deleted: ${domain.imagePath}`);
          } catch (error) {
            console.error('Error deleting old image:', error);
          }
        } else {
          console.log('Old image does not exist:', oldImagePath);
        }
      }

      // Update the domain in the database
      console.log('Updating domain in the database with new data...');
      await domainsCollection.updateOne({ title },{$set: updatedData,}); // Only update the fields provided        

      console.log('Domain updated successfully.');

      // Send success response
      return res.json({
        status: "success",
        message: "Domain updated successfully.",
      });
    } catch (error) {
      console.error("Error in file upload and database update:", error);
      return res.json({ message: "Server error", error: error.message });
    }
  });
};

//download mapper file
const downloadMapperFile = async (req, res) => {
  const { id } = req.params;

  try {
    const mongo = connection.getDB();
    const domainsCollection = mongo.collection("domains");
    const domain = await domainsCollection.findOne({ _id: connection.getObjectId(id) });

    if (!domain) {
      console.log(`Domain not found with given id.`);
      return res.json({status:"failed", message: "Domain not found.",});
    }

    // Get the file path for the mapper file from the database
    const filePath = path.join(__dirname, '..', domain.mapperFile_Url);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return res.json({
        status:"failed",
        message: "File not found on the server.",
      });
    }
    
    // Send the file as a download
    res.download(filePath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        return res.json({
          status:"failed",
          message: "Error downloading the file.",
        });
      }
    });

  } catch (error) {
    console.error("Error in file download:", error);
    return res.json({
      status:"failed",
      message: "Server error",
      error: error.message,
    });
  }
};

const renderImage=async (req,res) => {
      const id=req.params.id;
      try {
        const mongo = connection.getDB();
        const domainsCollection = mongo.collection("domains");
        const domain = await domainsCollection.findOne({ _id: connection.getObjectId(id) });
    
        if (!domain) {
          console.log(`Domain not found with given id.`);
          return res.json({status:"failed", message: "Domain not found.",});
        }
    
        // Get the file path for the mapper file from the database
        const imagePath = path.join(__dirname, '..', domain.imagePath);
    
        // Check if the file exists
        if (!fs.existsSync(imagePath)) {
          console.log(`File not found: ${imagePath}`);
          return res.json({
            status:"failed",
            message: "Image not found on the server.",
          });
        }

        return res.sendFile(imagePath, (err) => {
          if (err) {
            console.error('Error rendering the image: ', err);
            return res.json({
              status:"failed",
              message: "Error rendering the image",
            });
          }
        }); // This will show the image in the browser
      }catch{
        res.json(
          {
            status:"failed",
            message:"error occured",
            error:error.message
          });
      }    
}
module.exports = { createDomain, getDomain, getAllDomains, deleteDomain, updateDomain, downloadMapperFile, renderImage };
