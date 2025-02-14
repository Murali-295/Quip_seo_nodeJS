const multer = require("multer");
const path = require("path");
const connection = require("../utility/connection"); // Ensure your DB connection logic is correct
const fs = require("fs");

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

      // Check if all required fields are provided
      if (!title || title.trim() === "") {
        return res.json({
          status: "failed",
          message: "title field should not be empty or null.",
        });
      }

      if (!url || url.trim() === "") {
        return res.json({
          status: "failed",
          message: "url field should not be empty or null.",
        });
      }

      if (!description || description.trim() === "") {
        return res.json({
          status: "failed",
          message: "description field should not be empty or null.",
        });
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
  return res.json({ status: "success", domains: domains });
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

  // Step 2: Retrieve file paths
  const filePath = domain.mapperFile_Url;
  const imagePath = domain.imagePath;

  // Set the base directory explicitly to the project root
  const fullFilePath = path.join(__dirname, "..", filePath); // Correct file path construction
  const fullImagePath = path.join(__dirname, "..", imagePath); // Correct image path construction

  console.log("Full file path:", fullFilePath); // Log file path
  console.log("Full image path:", fullImagePath); // Log image path

  // Step 3: Delete files
  const response = await deleteFiles([fullFilePath, fullImagePath]);

  if (response.status === "failed") {
    return res.json({
      status: "failed",
      message: response.message,
    });
  }

  // Step 4: Delete the document after the files have been deleted
  const result = await domainsCollection.findOneAndDelete({
    _id: connection.getObjectId(id),
  });

  if (!result) {
    return res.json({
      status: "failed",
      message: "Error deleting the domain document.",
    });
  }

  // Step 5: Return success response with the deleted domain data
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
  const reqData = req.body;
  const id = reqData.id;

  try {
    const mongoDB = connection.getDB();
    const domainsCollection = mongoDB.collection("domains");
    const domain = await domainsCollection.findOne({
      _id: connection.getObjectId(id),
    });
    if (!domain) {
      res.json({
        status: "failed",
        message: "domain not found with the given id",
      });
    }
  } catch (error) {}
};

module.exports = {
  createDomain,
  getDomain,
  getAllDomains,
  deleteDomain,
  updateDomain,
}; // Export the controller function
