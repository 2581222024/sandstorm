const zlib = Npm.require("zlib");
const xml2js = Npm.require("xml2js");
const xmlCrypto = Npm.require("xml-crypto");
const crypto = Npm.require("crypto");
const xmldom = Npm.require("xmldom");
const querystring = Npm.require("querystring");

SAML = function (options) {
  this.options = this.initialize(options);
};

SAML.prototype.initialize = function (options) {
  if (!options) {
    options = {};
  }

  if (!options.protocol) {
    options.protocol = "https://";
  }

  if (!options.path) {
    options.path = "/saml/consume";
  }

  if (!options.issuer) {
    options.issuer = "onelogin_saml";
  }

  if (options.identifierFormat === undefined) {
    options.identifierFormat = "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent";
  }

  return options;
};

SAML.prototype.generateUniqueID = function () {
  const chars = "abcdef0123456789";
  let uniqueID = "";
  for (let i = 0; i < 20; i++) {
    uniqueID += chars.substr(Math.floor((Math.random() * 15)), 1);
  }

  return uniqueID;
};

SAML.prototype.generateInstant = function () {
  const date = new Date();
  return date.getUTCFullYear() + "-" + ("0" + (date.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + date.getUTCDate()).slice(-2) + "T" + ("0" + (date.getUTCHours())).slice(-2) + ":" + ("0" + date.getUTCMinutes()).slice(-2) + ":" + ("0" + date.getUTCSeconds()).slice(-2) + "Z";
};

SAML.prototype.signRequest = function (xml) {
  const signer = crypto.createSign("RSA-SHA1");
  signer.update(xml);
  return signer.sign(this.options.privateCert, "base64");
};

SAML.prototype.generateAuthorizeRequest = function (req) {
  let id = "_" + this.generateUniqueID();
  const instant = this.generateInstant();

  let callbackUrl;
  // Post-auth destination
  if (this.options.callbackUrl) {
    callbackUrl = this.options.callbackUrl;
  } else {
    callbackUrl = this.options.protocol + req.headers.host + this.options.path;
  }

  if (this.options.id)
    id = this.options.id;

  let request =
   "<samlp:AuthnRequest xmlns:samlp=\"urn:oasis:names:tc:SAML:2.0:protocol\" ID=\"" + id + "\" Version=\"2.0\" IssueInstant=\"" + instant +
   "\" ProtocolBinding=\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\" AssertionConsumerServiceURL=\"" + callbackUrl + "\" Destination=\"" +
   this.options.entryPoint + "\">" +
    "<saml:Issuer xmlns:saml=\"urn:oasis:names:tc:SAML:2.0:assertion\">" + this.options.issuer + "</saml:Issuer>\n";

  if (this.options.identifierFormat) {
    request += "<samlp:NameIDPolicy xmlns:samlp=\"urn:oasis:names:tc:SAML:2.0:protocol\" Format=\"" + this.options.identifierFormat +
    "\" AllowCreate=\"true\"></samlp:NameIDPolicy>\n";
  }

  request +=
    "<samlp:RequestedAuthnContext xmlns:samlp=\"urn:oasis:names:tc:SAML:2.0:protocol\" Comparison=\"exact\">" +
    "<saml:AuthnContextClassRef xmlns:saml=\"urn:oasis:names:tc:SAML:2.0:assertion\">urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></samlp:RequestedAuthnContext>\n" +
  "</samlp:AuthnRequest>";

  return request;
};

SAML.prototype.generateLogoutRequest = function (req) {
  const id = "_" + this.generateUniqueID();
  const instant = this.generateInstant();

  //samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  // ID="_135ad2fd-b275-4428-b5d6-3ac3361c3a7f" Version="2.0" Destination="https://idphost/adfs/ls/"
  //IssueInstant="2008-06-03T12:59:57Z"><saml:Issuer>myhost</saml:Issuer><NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
  //NameQualifier="https://idphost/adfs/ls/">myemail@mydomain.com</NameID<samlp:SessionIndex>_0628125f-7f95-42cc-ad8e-fde86ae90bbe
  //</samlp:SessionIndex></samlp:LogoutRequest>

  const request = "<samlp:LogoutRequest xmlns:samlp=\"urn:oasis:names:tc:SAML:2.0:protocol\" " +
    "xmlns:saml=\"urn:oasis:names:tc:SAML:2.0:assertion\" ID=\"" + id + "\" Version=\"2.0\" IssueInstant=\"" + instant +
    "\" Destination=\"" + this.options.entryPoint + "\">" +
    "<saml:Issuer xmlns:saml=\"urn:oasis:names:tc:SAML:2.0:assertion\">" + this.options.issuer + "</saml:Issuer>" +
    "<saml:NameID Format=\"" + req.user.nameIDFormat + "\">" + req.user.nameID + "</saml:NameID>" +
    "</samlp:LogoutRequest>";
  return request;
};

SAML.prototype.requestToUrl = function (request, operation, callback) {
  const _this = this;
  zlib.deflateRaw(request, function (err, buffer) {
    if (err) {
      return callback(err);
    }

    const base64 = buffer.toString("base64");
    let target = _this.options.entryPoint;

    if (operation === "logout") {
      if (_this.options.logoutUrl) {
        target = _this.options.logoutUrl;
      }
    }

    if (target.indexOf("?") > 0)
      target += "&";
    else
      target += "?";

    const samlRequest = {
      SAMLRequest: base64,
    };

    if (_this.options.privateCert) {
      samlRequest.SigAlg = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
      samlRequest.Signature = _this.signRequest(querystring.stringify(samlRequest));
    }

    target += querystring.stringify(samlRequest);

    callback(null, target);
  });
};

SAML.prototype.getAuthorizeUrl = function (req, callback) {
  const request = this.generateAuthorizeRequest(req);

  this.requestToUrl(request, "authorize", callback);
};

SAML.prototype.getLogoutUrl = function (req, callback) {
  const request = this.generateLogoutRequest(req);

  this.requestToUrl(request, "logout", callback);
};

SAML.prototype.certToPEM = function (cert) {
  cert = cert.match(/.{1,64}/g).join("\n");
  cert = "-----BEGIN CERTIFICATE-----\n" + cert;
  cert = cert + "\n-----END CERTIFICATE-----\n";
  return cert;
};

SAML.prototype.validateSignature = function (xml, cert) {
  const _this = this;
  const doc = new xmldom.DOMParser().parseFromString(xml);
  const signature = xmlCrypto.xpath(doc, "//*[local-name(.)='Signature' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']")[0];
  const sig = new xmlCrypto.SignedXml();
  sig.keyInfoProvider = {
    getKeyInfo: function (key) {
      return "<X509Data></X509Data>";
    },

    getKey: function (keyInfo) {
      return _this.certToPEM(cert);
    },
  };
  sig.loadSignature(signature.toString());
  return sig.checkSignature(xml);
};

SAML.prototype.getElement = function (parentElement, elementName) {
  if (parentElement["saml:" + elementName]) {
    return parentElement["saml:" + elementName];
  } else if (parentElement["samlp:" + elementName]) {
    return parentElement["samlp:" + elementName];
  } else if (parentElement["saml2p:" + elementName]) {
    return parentElement["saml2p:" + elementName];
  } else if (parentElement["saml2:" + elementName]) {
    return parentElement["saml2:" + elementName];
  }

  return parentElement[elementName];
};

SAML.prototype.validateResponse = function (samlResponse, callback) {
  const _this = this;
  const xml = new Buffer(samlResponse, "base64").toString("ascii");
  const parser = new xml2js.Parser({ explicitRoot:true });
  parser.parseString(xml, function (err, doc) {
    // Verify signature
    if (_this.options.cert && !_this.validateSignature(xml, _this.options.cert)) {
      return callback(new Error("Invalid signature"), null, false);
    }

    const response = _this.getElement(doc, "Response");
    if (response) {
      const assertion = _this.getElement(response, "Assertion");
      if (!assertion) {
        return callback(new Error("Missing SAML assertion"), null, false);
      }

      profile = {};

      if (response.$ && response.$.InResponseTo) {
        profile.inResponseToId = response.$.InResponseTo;
      }

      const issuer = _this.getElement(assertion[0], "Issuer");
      if (issuer) {
        profile.issuer = issuer[0];
      }

      const subject = _this.getElement(assertion[0], "Subject");
      if (subject) {
        const nameID = _this.getElement(subject[0], "NameID");
        if (nameID) {
          profile.nameID = nameID[0]._;

          if (nameID[0].$.Format) {
            profile.nameIDFormat = nameID[0].$.Format;
            if (profile.nameIDFormat.toLowerCase().indexOf("transient") !== -1) {
              return callback(new Error("SAML Response's with Transient NameIDs " +
                "are not allowed"));
            }
          }
        }

        const subjectConfirmation = _this.getElement(subject[0], "SubjectConfirmation");
        if (subjectConfirmation) {
          const subjectConfirmationData = _this.getElement(subjectConfirmation[0],
            "SubjectConfirmationData")[0];
          if (subjectConfirmationData) {
            const recipient = subjectConfirmationData.$.Recipient;
            if (recipient && !recipient.startsWith(process.env.ROOT_URL)) {
              return callback(new Error("SAML sent to wrong recipient"));
            }

            const nowMs = Date.now();
            const notOnOrBefore = subjectConfirmationData.$.NotOnOrBefore;
            if (notOnOrBefore && nowMs <= Date.parse(notOnOrBefore)) {
              return callback(new Error("SAML assertion was signed for the future."));
            }

            const notOnOrAfter = subjectConfirmationData.$.NotOnOrAfter;
            if (notOnOrAfter && nowMs >= Date.parse(notOnOrAfter)) {
              return callback(new Error("SAML assertion was signed for the past."));
            }
          }
        }
      }

      const attributeStatement = _this.getElement(assertion[0], "AttributeStatement");
      if (attributeStatement) {
        const attributes = _this.getElement(attributeStatement[0], "Attribute");

        if (attributes) {
          attributes.forEach(function (attribute) {
            const value = _this.getElement(attribute, "AttributeValue");
            if (typeof value[0] === "string") {
              profile[attribute.$.Name] = value[0];
            } else {
              profile[attribute.$.Name] = value[0]._;
            }
          });
        }

        if (!profile.mail && profile["urn:oid:0.9.2342.19200300.100.1.3"]) {
          // See http://www.incommonfederation.org/attributesummary.html for definition of attribute OIDs
          profile.mail = profile["urn:oid:0.9.2342.19200300.100.1.3"];
        }

        if (!profile.email && profile.mail) {
          profile.email = profile.mail;
        }
      }

      if (!profile.email && profile.nameID && profile.nameIDFormat && profile.nameIDFormat.indexOf("emailAddress") >= 0) {
        profile.email = profile.nameID;
      }

      callback(null, profile, false);
    } else {
      const logoutResponse = _this.getElement(doc, "LogoutResponse");

      if (logoutResponse) {
        callback(null, null, true);
      } else {
        return callback(new Error("Unknown SAML response message"), null, false);
      }

    }

  });
};