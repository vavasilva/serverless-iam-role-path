'use strict';

class ServerlessIamRolePath {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    
    this.hooks = {
      'before:package:finalize': this.addPath.bind(this),
    };
  }

  addPath() {
    const service = this.serverless.service;
    
    // Check if serverless-iam-roles-per-function plugin is present
    const plugins = service.plugins || [];
    if (!plugins.includes('serverless-iam-roles-per-function')) {
      this.serverless.cli.log('Warning: serverless-iam-roles-per-function plugin is required for serverless-iam-role-path to work properly');
      return;
    }
    
    const defaultPath = service.custom?.iamRolePath?.path;
    
    if (!defaultPath && !this.hasFunctionPaths(service)) {
      return;
    }
    
    const resources = service.resources?.Resources || {};
    
    // Process all functions
    Object.keys(service.functions || {}).forEach(functionName => {
      const functionObj = service.functions[functionName];
      const roleName = this.getLambdaRoleName(functionName);
      
      // Check if function has specific path configuration
      const functionPath = functionObj.iamRolePath || defaultPath;
      
      if (!functionPath) {
        return; // Skip this function if no path is defined
      }
      
      if (resources[roleName]) {
        const roleResource = resources[roleName];
        
        // Add path if specified
        if (roleResource.Type === 'AWS::IAM::Role') {
          roleResource.Properties = roleResource.Properties || {};
          roleResource.Properties.Path = functionPath;
        }
      }
    });
    
    // Process default role if exists
    const defaultRoleName = 'IamRoleLambdaExecution';
    if (resources[defaultRoleName] && defaultPath) {
      const defaultRole = resources[defaultRoleName];
      
      if (defaultRole.Type === 'AWS::IAM::Role') {
        defaultRole.Properties = defaultRole.Properties || {};
        defaultRole.Properties.Path = defaultPath;
      }
    }
  }
  
  getLambdaRoleName(functionName) {
    const normalized = this.normalizeFunctionName(functionName);
    return `${normalized}LambdaRole`;
  }
  
  normalizeFunctionName(functionName) {
    return functionName.replace(/-/g, 'Dash')
      .replace(/_/g, 'Underscore')
      .replace(/\./g, 'Dot')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  hasFunctionPaths(service) {
    const functions = service.functions || {};
    return Object.values(functions).some(func => !!func.iamRolePath);
  }
}

module.exports = ServerlessIamRolePath;