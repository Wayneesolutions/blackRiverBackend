import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BlackRiver Fleet Management API',
      version: '1.0.0',
      description: 'Comprehensive API for Fleet Management System including Vehicle Services, Employee Management, and more',
      contact: {
        name: 'BlackRiver Support',
        email: 'support@blackriver.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server'
      },
      {
        url: 'https://portal.logistiqinnovations.ca/api/v1',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        // Common Schemas
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Error message'
            },
            error: {
              type: 'string',
              example: 'Detailed error message'
            }
          }
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Validation failed'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  msg: { type: 'string' },
                  param: { type: 'string' },
                  location: { type: 'string' }
                }
              }
            }
          }
        },
        
        // User/Employee Schemas
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j1'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@company.com'
            },
            phone: {
              type: 'string',
              example: '+1234567890'
            },
            country: {
              type: 'string',
              example: 'USA'
            },
            state: {
              type: 'string',
              example: 'California'
            },
            city: {
              type: 'string',
              example: 'Los Angeles'
            },
            role: {
              type: 'string',
              enum: ['admin', 'superadmin', 'driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter', 'accountant'],
              example: 'driver'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive'],
              example: 'active'
            },
            joinDate: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-15T00:00:00.000Z'
            },
            profileImageUrl: {
              type: 'string',
              example: 'https://example.com/profile.jpg'
            },
            avatar: {
              type: 'string',
              example: 'avatar_url'
            },
            company: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j1'
            },
            internalId: {
              type: 'string',
              example: 'EMP001'
            },
            location: {
              type: 'object',
              properties: {
                address: {
                  type: 'string',
                  example: '123 Main St, Los Angeles, CA'
                },
                longitude: {
                  type: 'string',
                  example: '-118.2437'
                },
                latitude: {
                  type: 'string',
                  example: '34.0522'
                }
              }
            },
            details: {
              type: 'object',
              properties: {
                licenceNumber: {
                  type: 'string',
                  example: 'DL123456789'
                },
                vendor: {
                  type: 'string',
                  example: 'ABC Transport'
                },
                vehicle: {
                  type: 'string',
                  example: '64f1a2b3c4d5e6f7g8h9i0j2'
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        
        CreateEmployeeRequest: {
          type: 'object',
          required: ['name', 'email', 'phone', 'country', 'role', 'state', 'city', 'joinDate', 'internalId'],
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              example: 'John Doe'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@company.com'
            },
            phone: {
              type: 'string',
              example: '+1234567890'
            },
            country: {
              type: 'string',
              example: 'USA'
            },
            password: {
              type: 'string',
              minLength: 6,
              example: 'Employee@123',
              description: 'Optional password, defaults to Employee@123 if not provided'
            },
            role: {
              type: 'string',
              enum: ['admin', 'superadmin', 'driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter', 'accountant'],
              example: 'driver'
            },
            policies: {
              type: 'string',
              example: 'Company policies and terms',
              description: 'Employee policies and terms agreement'
            },
            state: {
              type: 'string',
              example: 'California'
            },
            city: {
              type: 'string',
              example: 'Los Angeles'
            },
            joinDate: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-15T00:00:00.000Z'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive'],
              example: 'active'
            },
            company: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j1'
            },
            internalId: {
              type: 'string',
              example: 'EMP001'
            },
            address: {
              type: 'string',
              example: '123 Main St, Los Angeles, CA',
              description: 'Full address for geocoding'
            }
          }
        },
        
        UpdateEmployeeRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'John Smith'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.smith@company.com'
            },
            phone: {
              type: 'string',
              example: '+1234567891'
            },
            country: {
              type: 'string',
              example: 'USA'
            },
            password: {
              type: 'string',
              minLength: 6,
              example: 'NewPassword@123',
              description: 'New password for the employee'
            },
            role: {
              type: 'string',
              enum: ['admin', 'superadmin', 'driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter', 'accountant'],
              example: 'dispatcher'
            },
            policies: {
              type: 'string',
              example: 'Updated company policies',
              description: 'Employee policies and terms agreement'
            },
            state: {
              type: 'string',
              example: 'California'
            },
            city: {
              type: 'string',
              example: 'Los Angeles'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive'],
              example: 'active'
            },
            company: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j1'
            },
            internalId: {
              type: 'string',
              example: 'EMP001'
            },
            address: {
              type: 'string',
              example: '456 Oak St, Los Angeles, CA',
              description: 'Full address for geocoding'
            },
            vehicle: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j2'
            }
          }
        },
        
        ResetPasswordRequest: {
          type: 'object',
          required: ['password'],
          properties: {
            password: {
              type: 'string',
              minLength: 6,
              example: 'NewPassword@123',
              description: 'New password for the employee'
            }
          }
        },
        
        UpdateStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'inactive'],
              example: 'inactive'
            }
          }
        },
        
        BulkDeleteRequest: {
          type: 'object',
          required: ['employeeIds'],
          properties: {
            employeeIds: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['64f1a2b3c4d5e6f7g8h9i0j1', '64f1a2b3c4d5e6f7g8h9i0j2']
            }
          }
        },
        
        PaginationResponse: {
          type: 'object',
          properties: {
            currentPage: {
              type: 'integer',
              example: 1
            },
            totalPages: {
              type: 'integer',
              example: 5
            },
            totalEmployees: {
              type: 'integer',
              example: 47
            },
            hasNextPage: {
              type: 'boolean',
              example: true
            },
            hasPrevPage: {
              type: 'boolean',
              example: false
            }
          }
        },
        
        EmployeeStats: {
          type: 'object',
          properties: {
            total: {
              type: 'integer',
              example: 150
            },
            active: {
              type: 'integer',
              example: 142
            },
            inactive: {
              type: 'integer',
              example: 8
            },
            byRole: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  count: { type: 'integer' }
                }
              }
            },
            monthlyJoins: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  _id: {
                    type: 'object',
                    properties: {
                      year: { type: 'integer' },
                      month: { type: 'integer' }
                    }
                  },
                  count: { type: 'integer' }
                }
              }
            }
          }
        },
        
        // Vehicle Service Schemas
        VehicleService: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j1'
            },
            vehicleId: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j2'
            },
            serviceType: {
              type: 'string',
              enum: ['oil-change', 'tire-rotation', 'bike-inspection', 'general-maintenance', 'other'],
              example: 'oil-change'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              example: 'medium'
            },
            dueDate: {
              type: 'string',
              format: 'date',
              example: '2024-02-15'
            },
            dueMileage: {
              type: 'integer',
              example: 50000
            },
            assignedMechanic: {
              type: 'string',
              example: 'John Smith'
            },
            description: {
              type: 'string',
              example: 'Regular oil change service'
            },
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'completed'],
              example: 'pending'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        
        CreateVehicleServiceRequest: {
          type: 'object',
          required: ['vehicleId', 'serviceType', 'priority', 'dueDate', 'dueMileage', 'assignedMechanic'],
          properties: {
            vehicleId: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j2'
            },
            serviceType: {
              type: 'string',
              enum: ['oil-change', 'tire-rotation', 'bike-inspection', 'general-maintenance', 'other'],
              example: 'oil-change'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              example: 'medium'
            },
            dueDate: {
              type: 'string',
              format: 'date',
              example: '2024-02-15'
            },
            dueMileage: {
              type: 'integer',
              example: 50000
            },
            assignedMechanic: {
              type: 'string',
              example: 'John Smith'
            },
            description: {
              type: 'string',
              example: 'Regular oil change service'
            }
          }
        },
        
        UpdateVehicleServiceRequest: {
          type: 'object',
          properties: {
            vehicleId: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j2'
            },
            serviceType: {
              type: 'string',
              enum: ['oil-change', 'tire-rotation', 'bike-inspection', 'general-maintenance', 'other'],
              example: 'oil-change'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              example: 'high'
            },
            dueDate: {
              type: 'string',
              format: 'date',
              example: '2024-02-20'
            },
            dueMileage: {
              type: 'integer',
              example: 52000
            },
            assignedMechanic: {
              type: 'string',
              example: 'Mike Johnson'
            },
            description: {
              type: 'string',
              example: 'Updated service description'
            }
          }
        },
        
        UpdateServiceStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'completed'],
              example: 'in-progress'
            }
          }
        },
        
        ServiceFilters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'completed']
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent']
            },
            serviceType: {
              type: 'string',
              enum: ['oil-change', 'tire-rotation', 'bike-inspection', 'general-maintenance', 'other']
            },
            vehicleId: {
              type: 'string'
            },
            mechanic: {
              type: 'string'
            }
          }
        },
        
        // Login Schema
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'admin@blackriver.com'
            },
            password: {
              type: 'string',
              example: 'password123'
            }
          }
        },
        
        LoginResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'login success'
            },
            token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            },
            data: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string',
                  example: '64f1a2b3c4d5e6f7g8h9i0j1'
                },
                name: {
                  type: 'string',
                  example: 'Admin User'
                },
                email: {
                  type: 'string',
                  example: 'admin@blackriver.com'
                },
                role: {
                  type: 'string',
                  example: 'admin'
                }
              }
            }
          }
        },
        
        // Trailer Schemas
        Trailer: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j1'
            },
            trailer: {
              type: 'string',
              example: 'Trailer-001'
            },
            plateNumber: {
              type: 'string',
              example: 'TRL-12345'
            },
            type: {
              type: 'string',
              enum: ['dry_van', 'refrigerated', 'flatbed', 'tanker', 'container'],
              example: 'dry_van'
            },
            ownerShip: {
              type: 'string',
              example: 'Company Owned'
            },
            lastDispatch: {
              type: 'string',
              example: '2024-01-15'
            },
            lastDropLocation: {
              type: 'string',
              example: 'Warehouse A'
            },
            note: {
              type: 'string',
              example: 'Regular maintenance trailer'
            },
            operationStatus: {
              type: 'string',
              enum: ['in_transit', 'loading', 'idle', 'maintenance', 'available'],
              example: 'available'
            },
            loadStatus: {
              type: 'string',
              example: 'empty'
            },
            compilance: {
              type: 'string',
              example: 'compliant'
            },
            internalId: {
              type: 'string',
              example: 'GEOTAB-TRL-001'
            },
            currentLocation: {
              type: 'object',
              properties: {
                address: {
                  type: 'string',
                  example: 'Los Angeles, CA'
                },
                longitude: {
                  type: 'string',
                  example: '-118.2437'
                },
                latitude: {
                  type: 'string',
                  example: '34.0522'
                },
                updatedAt: {
                  type: 'string',
                  format: 'date-time',
                  example: '2024-01-15T10:30:00.000Z'
                }
              }
            },
            speed: {
              type: 'number',
              example: 0
            },
            status: {
              type: 'string',
              enum: ['moving', 'idle', 'stopped', 'maintenance'],
              example: 'stopped'
            },
            capacity: {
              type: 'string',
              example: '26,000 lbs'
            },
            isAttached: {
              type: 'boolean',
              example: false
            },
            attachedVehicle: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string',
                  example: '64f1a2b3c4d5e6f7g8h9i0j2'
                },
                plateNumber: {
                  type: 'string',
                  example: 'VH-12345'
                },
                make: {
                  type: 'string',
                  example: 'Freightliner'
                },
                model: {
                  type: 'string',
                  example: 'Cascadia'
                },
                driver: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      example: 'John Smith'
                    }
                  }
                }
              }
            },
            cargoDetails: {
              type: 'object',
              properties: {
                cargoType: {
                  type: 'string',
                  example: 'General Cargo'
                },
                weight: {
                  type: 'number',
                  example: 0
                },
                capacity: {
                  type: 'number',
                  example: 26000
                },
                description: {
                  type: 'string',
                  example: 'Standard dry van trailer'
                },
                temperature: {
                  type: 'number',
                  example: 20
                },
                isRefrigerated: {
                  type: 'boolean',
                  example: false
                }
              }
            },
            sensors: {
              type: 'object',
              properties: {
                doorStatus: {
                  type: 'string',
                  enum: ['locked', 'unlocked', 'open'],
                  example: 'locked'
                },
                temperature: {
                  type: 'number',
                  example: 20
                },
                humidity: {
                  type: 'number',
                  example: 45
                },
                shockDetection: {
                  type: 'boolean',
                  example: false
                },
                tilting: {
                  type: 'boolean',
                  example: false
                }
              }
            },
            maintenance: {
              type: 'object',
              properties: {
                lastService: {
                  type: 'string',
                  format: 'date',
                  example: '2024-01-01'
                },
                nextService: {
                  type: 'string',
                  format: 'date',
                  example: '2024-04-01'
                },
                tyreCondition: {
                  type: 'string',
                  enum: ['good', 'fair', 'poor'],
                  example: 'good'
                },
                brakeCondition: {
                  type: 'string',
                  enum: ['good', 'fair', 'poor'],
                  example: 'good'
                },
                issues: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  example: []
                }
              }
            },
            route: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  latitude: {
                    type: 'string',
                    example: '34.0522'
                  },
                  longitude: {
                    type: 'string',
                    example: '-118.2437'
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                    example: '2024-01-15T10:30:00.000Z'
                  }
                }
              }
            },
            destination: {
              type: 'object',
              properties: {
                address: {
                  type: 'string',
                  example: 'San Francisco, CA'
                },
                latitude: {
                  type: 'string',
                  example: '37.7749'
                },
                longitude: {
                  type: 'string',
                  example: '-122.4194'
                },
                updatedAt: {
                  type: 'string',
                  format: 'date-time',
                  example: '2024-01-15T10:30:00.000Z'
                }
              }
            },
            company: {
              type: 'string',
              example: '64f1a2b3c4d5e6f7g8h9i0j1'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-15T10:30:00.000Z'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-15T10:30:00.000Z'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './routes/*.js', // Path to the API routes files
    './routes/*.swagger.js' // Path to the Swagger documentation files
  ]
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };
