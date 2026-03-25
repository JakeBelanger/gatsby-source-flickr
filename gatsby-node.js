const { URLSearchParams } = require("url");
const { createRemoteFileNode } = require("gatsby-source-filesystem");

exports.sourceNodes = async (
  { actions: { createNode }, createNodeId, createContentDigest, cache },
  { plugins, ...options },
) => {
  // const sizes = ['sq', 't', 's', 'q', 'm', 'n', 'z,', 'c', 'l', 'z'];

  // The flickr API has some issues when put into GraphQL - create a suitable version
  const fixPhoto = (photo) => {
    const fixed = photo;

    // Don't name crash with node.id
    fixed.photo_id = fixed.id;
    delete fixed.id;

    // Fall back through original → k-large → large sizes
    const srcSize = ["o", "k", "l", "c"].find((s) => photo[`url_${s}`]);
    fixed.original_src = srcSize ? photo[`url_${srcSize}`] : null;
    fixed.width = srcSize ? parseInt(photo[`width_${srcSize}`]) : null;
    fixed.height = srcSize ? parseInt(photo[`height_${srcSize}`]) : null;

    delete fixed.url_o;
    delete fixed.width_o;
    delete fixed.height_o;
    delete fixed.url_k;
    delete fixed.width_k;
    delete fixed.height_k;
    delete fixed.url_l;
    delete fixed.width_l;
    delete fixed.height_l;

    // Some fields can come down as either string or number. GraphQL doesn't like that. Force everything to number

    // sizes.forEach(suffix => {
    //   if (fixed.hasOwnProperty(`height_${suffix}`)) {
    //     fixed[`height_${suffix}`] = parseInt(fixed[`height_${suffix}`]);
    //   }
    //   if (fixed.hasOwnProperty(`width_${suffix}`)) {
    //     fixed[`width_${suffix}`] = parseInt(fixed[`width_${suffix}`]);
    //   }
    // });

    if (fixed.hasOwnProperty("accuracy")) {
      fixed.accuracy = parseInt(fixed.accuracy);
    }

    // A missing latitude or longitude can come down as either 0 or "0" - force to string

    if (fixed.hasOwnProperty("latitude")) {
      fixed.latitude = "" + fixed.latitude;
    }
    if (fixed.hasOwnProperty("longitude")) {
      fixed.longitude = "" + fixed.longitude;
    }

    // These can come down as either string or number. Have only ever seen "0" and 0 here - and documentation is sparse - remove them

    if (fixed.hasOwnProperty("datetakengranularity")) {
      delete fixed.datetakengranularity;
    }
    if (fixed.hasOwnProperty("datetakenunknown")) {
      delete fixed.datetakenunknown;
    }

    // Convert Date versions of dateupload and lastupdate

    if (fixed.hasOwnProperty("dateupload")) {
      fixed.dateupload = new Date(fixed.dateupload * 1000);
    }
    if (fixed.hasOwnProperty("lastupdate")) {
      fixed.lastupdate = new Date(fixed.lastupdate * 1000);
    }

    // Simplify the structure of the description to just a string

    if (fixed.hasOwnProperty("description")) {
      if (fixed.description.hasOwnProperty("_content")) {
        fixed.description = fixed.description._content;
      }
    }

    return fixed;
  };

  const unwrap = (data) => {
    if (data.hasOwnProperty("photoset")) {
      return data.photoset;
    }

    return data.photos;
  };

  const callFlickr = async (options) => {
    const params = new URLSearchParams(options);
    const url = `https://api.flickr.com/services/rest/?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();

    const photos = unwrap(data);

    if (!photos) throw JSON.stringify(data);

    // @TODO: gather all the async tasks
    photos.photo.forEach(async (raw) => {
      const photo = fixPhoto(raw);
      const nodeId = createNodeId(`flickr-photo-${photo.photo_id}`);

      const fileNode = await createRemoteFileNode({
        url: photo.original_src,
        createNode,
        createNodeId,
        cache,
      });

      createNode({
        ...photo,
        localFile: fileNode.id,
        id: nodeId,
        parent: null,
        children: [],
        internal: {
          type: "FlickrPhoto",
          content: JSON.stringify(photo),
          contentDigest: createContentDigest(photo),
        },
      });
    });

    if (photos.page < photos.pages)
      await callFlickr({
        ...options,
        page: photos.page + 1,
      });
  };

  await callFlickr({
    method: "flickr.photos.search",
    extras:
      "description, license, date_upload, date_taken, owner_name, original_format, last_update, geo, tags, machine_tags, views, media, url_o, width_o, height_o, url_k, width_k, height_k, url_l, width_l, height_l, url_c, width_c, height_c",
    per_page: 500,
    page: 1,
    format: "json",
    nojsoncallback: 1,
    ...options,
  });
};

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions;

  createTypes(`
    type FlickrPhoto implements Node {
      localFile: File @link
      id: String
      secret: String
      server: String

      title: String
      description: String
      original_src: String
      width: Int
      height: Int
      originalformat: String

      owner_name: String
      media: String
      views: Int
      tags: String 
      machine_tags: String
      license: String

      dateupload: Date
      datetaken: Date
      lastupdate: Date
    }
  `);
};
