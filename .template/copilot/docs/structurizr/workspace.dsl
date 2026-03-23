workspace "Architecture Template" "Starter C4 workspace for a new project" {
    !identifiers hierarchical

    model {
        // Rename the primary actor and software system to match your own domain.
        primaryUser = person "Primary User" "Interacts with the product through its main interface"

        system = softwareSystem "Template System" "Replace this with your product or platform name" {
            webApp = container "Web Application" "Primary user-facing interface" "TypeScript / Vue / React / etc." {
                useCase = component "Main Use Case" "Coordinates a core user workflow" {
                    tags "Application"
                }
                port = component "External Service Port" "Abstract dependency used by the use case" {
                    tags "Port"
                }
                adapter = component "External Service Adapter" "Implements the external dependency" {
                    tags "Adapter"
                }
                repository = component "Repository Adapter" "Stores and retrieves application state" {
                    tags "Adapter"
                }
            }
        }

        externalApi = softwareSystem "External API" "Example upstream or downstream dependency" {
            tags "External"
        }

        primaryUser -> system.webApp "Uses"
        system.webApp.useCase -> system.webApp.port "Invokes"
        system.webApp.port -> system.webApp.adapter "Implemented by"
        system.webApp.useCase -> system.webApp.repository "Reads/writes state"
        system.webApp.adapter -> externalApi "Calls"
    }

    views {
        systemContext system "template-system-c1" {
            include *
            autolayout lr
            title "Template System (C1)"
            description "System context view for the starter workspace"
        }

        container system "template-system-c2" {
            include *
            autolayout lr
            title "Template System (C2)"
            description "Container view for the starter workspace"
        }

        component system.webApp "template-system-c3" {
            include *
            autolayout tb
            title "Template System (C3)"
            description "Component view for the starter workspace"
        }

        styles {
            element "Person" {
                shape Person
                background #f1f8ff
                color #0f3c61
            }
            element "Application" {
                background #fff3e0
                color #e65100
            }
            element "Port" {
                shape Hexagon
                background #ede7f6
                color #4527a0
            }
            element "Adapter" {
                background #e3f2fd
                color #0d47a1
            }
            element "External" {
                background #eceff1
                color #37474f
                stroke #607d8b
                strokeWidth 2
            }
            relationship "Relationship" {
                thickness 3
            }
        }
    }
}
